import { describe, it, expect } from 'vitest'
import {
  parseCSV,
  inferMapping,
  mapRows,
  IMPORT_FIELDS,
  SKIP_COLUMN,
  summarizeMapping
} from '../lib/csvImport.js'

// ============ parseCSV ============

describe('parseCSV', () => {
  it('returns empty when input is empty', () => {
    expect(parseCSV('')).toEqual({ headers: [], rows: [] })
  })

  it('returns empty for non-string input', () => {
    expect(parseCSV(null)).toEqual({ headers: [], rows: [] })
    expect(parseCSV(undefined)).toEqual({ headers: [], rows: [] })
    expect(parseCSV(123)).toEqual({ headers: [], rows: [] })
  })

  it('parses a header row only', () => {
    const r = parseCSV('name,email')
    expect(r.headers).toEqual(['name', 'email'])
    expect(r.rows).toEqual([])
  })

  it('parses simple rows with LF', () => {
    const r = parseCSV('name,email\nAlice,a@x.com\nBob,b@x.com')
    expect(r.headers).toEqual(['name', 'email'])
    expect(r.rows).toEqual([['Alice', 'a@x.com'], ['Bob', 'b@x.com']])
  })

  it('parses CRLF line endings', () => {
    const r = parseCSV('a,b\r\n1,2\r\n3,4')
    expect(r.rows).toEqual([['1', '2'], ['3', '4']])
  })

  it('parses mixed line endings', () => {
    const r = parseCSV('a,b\n1,2\r\n3,4\r5,6')
    expect(r.rows).toEqual([['1', '2'], ['3', '4'], ['5', '6']])
  })

  it('handles quoted fields with embedded commas', () => {
    const r = parseCSV('name,location\n"Smith, John","Mumbai, IN"')
    expect(r.rows).toEqual([['Smith, John', 'Mumbai, IN']])
  })

  it('handles escaped quotes ("") inside quoted fields', () => {
    const r = parseCSV('name,note\n"Alice","She said ""hi"""')
    expect(r.rows).toEqual([['Alice', 'She said "hi"']])
  })

  it('handles embedded newlines inside quoted fields', () => {
    const r = parseCSV('name,note\n"Alice","line1\nline2"')
    expect(r.rows).toEqual([['Alice', 'line1\nline2']])
  })

  it('strips a UTF-8 BOM', () => {
    const r = parseCSV('﻿name,email\nAlice,a@x.com')
    expect(r.headers).toEqual(['name', 'email'])
    expect(r.rows).toEqual([['Alice', 'a@x.com']])
  })

  it('pads short rows to header length', () => {
    const r = parseCSV('a,b,c\n1,2')
    expect(r.rows).toEqual([['1', '2', '']])
  })

  it('drops trailing empty rows from terminal newlines', () => {
    const r = parseCSV('a,b\n1,2\n\n\n')
    expect(r.rows).toEqual([['1', '2']])
  })

  it('preserves blank cells in a row that has any non-empty value', () => {
    const r = parseCSV('a,b,c\nAlice,,a@x.com')
    expect(r.rows).toEqual([['Alice', '', 'a@x.com']])
  })

  it('drops all-empty rows (treats them as trailing-newline junk)', () => {
    const r = parseCSV('a,b,c\n,,\nAlice,b,c')
    // The empty record between the data rows is junk; only the real row survives.
    expect(r.rows).toEqual([['Alice', 'b', 'c']])
  })

  it('trims whitespace from headers only', () => {
    const r = parseCSV('  name  , email \n  Alice  ,a@x.com')
    expect(r.headers).toEqual(['name', 'email'])
    expect(r.rows).toEqual([['  Alice  ', 'a@x.com']])
  })
})

// ============ inferMapping ============

describe('inferMapping', () => {
  it('matches exact field keys', () => {
    expect(inferMapping(['full_name', 'email'])).toEqual({
      full_name: 'full_name',
      email: 'email'
    })
  })

  it('matches case-insensitively', () => {
    expect(inferMapping(['Full Name', 'EMAIL'])).toEqual({
      'Full Name': 'full_name',
      EMAIL: 'email'
    })
  })

  it('matches via aliases', () => {
    expect(inferMapping(['Email Address', 'Organisation', 'Phone Number'])).toEqual({
      'Email Address': 'email',
      Organisation: 'company',
      'Phone Number': 'phone'
    })
  })

  it('marks unmatched headers as SKIP_COLUMN', () => {
    expect(inferMapping(['Mystery Column'])).toEqual({
      'Mystery Column': SKIP_COLUMN
    })
  })

  it('does not double-assign one field to two headers', () => {
    const m = inferMapping(['name', 'full name'])
    const keys = Object.values(m)
    const fullCount = keys.filter(k => k === 'full_name').length
    expect(fullCount).toBe(1)
    // the second header should be skipped
    expect(keys.filter(k => k === SKIP_COLUMN).length).toBe(1)
  })

  it('handles blank headers', () => {
    expect(inferMapping([''])).toEqual({ '': SKIP_COLUMN })
  })
})

// ============ mapRows ============

describe('mapRows', () => {
  it('builds insertable objects from mapped rows', () => {
    const headers = ['Name', 'Email']
    const rows = [['Alice', 'a@x.com'], ['Bob', 'b@x.com']]
    const mapping = inferMapping(headers)
    const out = mapRows(rows, headers, mapping)
    expect(out).toHaveLength(2)
    expect(out[0].insertable).toEqual({ full_name: 'Alice', email: 'a@x.com' })
    expect(out[0].errors).toEqual([])
    expect(out[1].insertable).toEqual({ full_name: 'Bob', email: 'b@x.com' })
  })

  it('skips columns mapped to SKIP_COLUMN', () => {
    const headers = ['Name', 'Notes']
    const rows = [['Alice', 'private']]
    const mapping = { Name: 'full_name', Notes: SKIP_COLUMN }
    const out = mapRows(rows, headers, mapping)
    expect(out[0].insertable).toEqual({ full_name: 'Alice' })
  })

  it('flags missing required fields', () => {
    const headers = ['Email']
    const rows = [['a@x.com']]
    const mapping = { Email: 'email' }
    const out = mapRows(rows, headers, mapping)
    expect(out[0].errors).toEqual(['Missing Full name'])
  })

  it('trims values and skips blanks', () => {
    const headers = ['Name', 'Role']
    const rows = [['  Alice  ', '   ']]
    const mapping = { Name: 'full_name', Role: 'role' }
    const out = mapRows(rows, headers, mapping)
    expect(out[0].insertable).toEqual({ full_name: 'Alice' })
  })

  it('splits tags on commas + semicolons and dedupes whitespace', () => {
    const headers = ['Name', 'Tags']
    const rows = [['Alice', 'lp, vc; consumer ,  ']]
    const mapping = { Name: 'full_name', Tags: 'tags' }
    const out = mapRows(rows, headers, mapping)
    expect(out[0].insertable.tags).toEqual(['lp', 'vc', 'consumer'])
  })

  it('preserves rawIndex for UI error mapping', () => {
    const headers = ['Name']
    const rows = [['Alice'], ['Bob'], ['Carol']]
    const out = mapRows(rows, headers, { Name: 'full_name' })
    expect(out.map(o => o.rawIndex)).toEqual([0, 1, 2])
  })

  it('pads missing column cells to empty strings without throwing', () => {
    const headers = ['Name', 'Email']
    const rows = [['Alice']] // shorter than headers
    const out = mapRows(rows, headers, inferMapping(headers))
    expect(out[0].insertable).toEqual({ full_name: 'Alice' })
  })
})

// ============ IMPORT_FIELDS shape ============

describe('IMPORT_FIELDS registry', () => {
  it('has full_name marked required', () => {
    const f = IMPORT_FIELDS.find(x => x.key === 'full_name')
    expect(f.required).toBe(true)
  })

  it('keys are unique', () => {
    const keys = IMPORT_FIELDS.map(f => f.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('only tags is array-typed', () => {
    const arr = IMPORT_FIELDS.filter(f => f.isArray)
    expect(arr).toHaveLength(1)
    expect(arr[0].key).toBe('tags')
  })
})

describe('summarizeMapping', () => {
  it('counts mapped vs skipped', () => {
    const m = { a: 'full_name', b: SKIP_COLUMN, c: 'email' }
    expect(summarizeMapping(m)).toEqual({ mapped: 2, skipped: 1 })
  })
})
