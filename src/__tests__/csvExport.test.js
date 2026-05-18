import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { toCSV, downloadCSV, timestampedFilename } from '../lib/csvExport.js'

describe('toCSV', () => {
  it('returns empty for non-array rows or columns', () => {
    expect(toCSV(null, [{ key: 'a' }])).toBe('')
    expect(toCSV([], null)).toBe('')
    expect(toCSV([{ a: 1 }], [])).toBe('')
  })

  it('emits header row with labels (falling back to key)', () => {
    expect(toCSV([{ a: 1 }], [{ key: 'a', label: 'Alpha' }])).toBe('Alpha\r\n1')
    expect(toCSV([{ a: 1 }], [{ key: 'a' }])).toBe('a\r\n1')
  })

  it('uses CRLF line endings per RFC 4180', () => {
    const out = toCSV([{ a: 1 }, { a: 2 }], [{ key: 'a' }])
    expect(out).toBe('a\r\n1\r\n2')
  })

  it('omits missing/null/undefined as empty cells', () => {
    const out = toCSV([{ a: 'x' }], [{ key: 'a' }, { key: 'b' }, { key: 'c' }])
    expect(out).toBe('a,b,c\r\nx,,')
  })

  it('quotes cells containing comma, quote, or newline', () => {
    expect(toCSV([{ a: 'hello, world' }], [{ key: 'a' }])).toBe('a\r\n"hello, world"')
    expect(toCSV([{ a: 'line1\nline2' }], [{ key: 'a' }])).toBe('a\r\n"line1\nline2"')
    expect(toCSV([{ a: 'CR\r\nLF' }], [{ key: 'a' }])).toBe('a\r\n"CR\r\nLF"')
  })

  it('escapes embedded double quotes as ""', () => {
    expect(toCSV([{ a: 'She said "hi"' }], [{ key: 'a' }])).toBe('a\r\n"She said ""hi"""')
  })

  it('joins array values with semicolons (tags / reasons stay one column)', () => {
    expect(toCSV([{ tags: ['a', 'b', 'c'] }], [{ key: 'tags' }])).toBe('tags\r\na; b; c')
  })

  it('serializes Date as ISO string', () => {
    const d = new Date('2025-01-02T03:04:05Z')
    expect(toCSV([{ d }], [{ key: 'd' }])).toBe('d\r\n2025-01-02T03:04:05.000Z')
  })

  it('serializes plain objects via JSON', () => {
    expect(toCSV([{ payload: { x: 1 } }], [{ key: 'payload' }])).toBe('payload\r\n"{""x"":1}"')
  })

  it('neutralizes formula-injection prefixes by quoting with a leading apostrophe', () => {
    expect(toCSV([{ a: '=SUM(1,1)' }], [{ key: 'a' }])).toBe(`a\r\n"'=SUM(1,1)"`)
    expect(toCSV([{ a: '+attack' }], [{ key: 'a' }])).toBe(`a\r\n'+attack`)
    expect(toCSV([{ a: '-cmd' }], [{ key: 'a' }])).toBe(`a\r\n'-cmd`)
    expect(toCSV([{ a: '@evil' }], [{ key: 'a' }])).toBe(`a\r\n'@evil`)
  })

  it('does not mangle ordinary leading characters', () => {
    expect(toCSV([{ a: 'Acme' }], [{ key: 'a' }])).toBe('a\r\nAcme')
    expect(toCSV([{ a: '1.5' }], [{ key: 'a' }])).toBe('a\r\n1.5')
  })

  it('preserves column order from the schema', () => {
    const out = toCSV([{ a: 1, b: 2, c: 3 }], [{ key: 'c' }, { key: 'a' }, { key: 'b' }])
    expect(out).toBe('c,a,b\r\n3,1,2')
  })

  it('handles rows that are null without crashing', () => {
    const out = toCSV([null, { a: 1 }], [{ key: 'a' }])
    expect(out).toBe('a\r\n\r\n1')
  })
})

describe('timestampedFilename', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-04T05:06:00Z'))
  })
  afterEach(() => { vi.useRealTimers() })

  it('produces a YYYYMMDD-HHMM stamped name', () => {
    // The format uses LOCAL clock components; mocking the system time at a
    // UTC instant means the assertion just needs to match the pad shape.
    const out = timestampedFilename('interactions')
    expect(out).toMatch(/^interactions-\d{8}-\d{4}\.csv$/)
  })

  it('respects a custom extension', () => {
    expect(timestampedFilename('x', 'tsv')).toMatch(/\.tsv$/)
  })
})

describe('downloadCSV', () => {
  it('returns false in a non-DOM environment without throwing', () => {
    vi.stubGlobal('document', undefined)
    vi.stubGlobal('URL', undefined)
    expect(downloadCSV('x.csv', 'a,b\r\n1,2')).toBe(false)
    vi.unstubAllGlobals()
  })

  it('appends and removes a temporary anchor in a DOM environment', () => {
    const click = vi.fn()
    const append = vi.fn()
    const remove = vi.fn()
    const a = { style: {}, click }
    vi.stubGlobal('document', {
      createElement: () => a,
      body: { appendChild: append, removeChild: remove }
    })
    vi.stubGlobal('URL', {
      createObjectURL: () => 'blob:fake',
      revokeObjectURL: vi.fn()
    })
    vi.stubGlobal('Blob', class { constructor(parts, opts) { this.parts = parts; this.opts = opts } })

    expect(downloadCSV('out.csv', 'a\r\n1')).toBe(true)
    expect(a.href).toBe('blob:fake')
    expect(a.download).toBe('out.csv')
    expect(click).toHaveBeenCalled()
    expect(append).toHaveBeenCalledWith(a)
    expect(remove).toHaveBeenCalledWith(a)

    vi.unstubAllGlobals()
  })
})
