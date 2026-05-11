import { describe, it, expect } from 'vitest'
import { parseMentions, parseTags } from '../lib/kb.js'

const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'
const UUID_C = '33333333-3333-4333-8333-333333333333'
const UUID_D = '44444444-4444-4444-8444-444444444444'

describe('parseMentions', () => {
  it('returns empty for blank input', () => {
    expect(parseMentions('')).toEqual([])
    expect(parseMentions(null)).toEqual([])
    expect(parseMentions(undefined)).toEqual([])
  })

  it('parses person / fund / mandate tokens', () => {
    const body = `Met with [[person:${UUID_A}|Anita]] about [[mandate:${UUID_B}|HoV]]. Fund: [[fund:${UUID_C}|Sequoia]].`
    expect(parseMentions(body)).toEqual([
      { entity_type: 'person',  entity_id: UUID_A },
      { entity_type: 'mandate', entity_id: UUID_B },
      { entity_type: 'fund',    entity_id: UUID_C }
    ])
  })

  it('parses note tokens for backlinks', () => {
    const body = `Follow-up to [[note:${UUID_D}|Diligence prep]] — see prior session.`
    expect(parseMentions(body)).toEqual([
      { entity_type: 'note', entity_id: UUID_D }
    ])
  })

  it('dedupes repeated references to the same entity', () => {
    const body = `[[person:${UUID_A}|Anita]] and again [[person:${UUID_A}]] and the note [[note:${UUID_D}|X]] twice [[note:${UUID_D}]]`
    expect(parseMentions(body)).toEqual([
      { entity_type: 'person', entity_id: UUID_A },
      { entity_type: 'note',   entity_id: UUID_D }
    ])
  })

  it('lowercases hex ids and types for stable storage', () => {
    const upper = UUID_A.toUpperCase()
    expect(parseMentions(`[[PERSON:${upper}|x]]`)).toEqual([
      { entity_type: 'person', entity_id: UUID_A }
    ])
  })

  it('ignores unknown entity types', () => {
    expect(parseMentions(`[[strategic:${UUID_A}|x]]`)).toEqual([])
  })

  it('is re-entrant — repeated calls return the same result', () => {
    const body = `[[note:${UUID_D}|x]] then [[person:${UUID_A}|y]]`
    const first  = parseMentions(body)
    const second = parseMentions(body)
    expect(first).toEqual(second)
    expect(first).toHaveLength(2)
  })
})

describe('parseTags', () => {
  it('returns empty for blank', () => {
    expect(parseTags('')).toEqual([])
  })

  it('picks up hash-prefixed tags', () => {
    expect(parseTags('Notes on #healthcare and #m-and-a.')).toEqual(['healthcare', 'm-and-a'])
  })

  it('dedupes repeated tags', () => {
    expect(parseTags('#alpha and again #alpha')).toEqual(['alpha'])
  })

  it('ignores #x (too short) and trailing punctuation', () => {
    expect(parseTags('#a #ok #ten-chars-ok')).toEqual(['ok', 'ten-chars-ok'])
  })
})
