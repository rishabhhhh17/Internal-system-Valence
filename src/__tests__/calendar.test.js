import { describe, it, expect } from 'vitest'
import {
  weekStart, weekEnd,
  findCommonFreeSlots, groupBusyByCalendar, layoutDayColumn,
  personByEmail, attendeesWithPersonas,
  colorClassesFor
} from '../lib/calendar.js'

// Helpers — build a date that's deterministic regardless of the test runner's
// local timezone. We use local time everywhere; the slot finder is also local.
function at(year, month, day, hour, minute = 0) {
  return new Date(year, month - 1, day, hour, minute, 0, 0)
}
function ev(calId, year, month, day, startH, startM, endH, endM) {
  return {
    calendar_id: calId,
    starts_at: at(year, month, day, startH, startM).toISOString(),
    ends_at:   at(year, month, day, endH,   endM).toISOString()
  }
}

describe('weekStart / weekEnd', () => {
  it('Monday-anchored', () => {
    // 2026-05-13 was a Wednesday — week should run 2026-05-11 (Mon) → 2026-05-17 (Sun)
    const wed = new Date(2026, 4, 13)
    const ws = weekStart(wed)
    const we = weekEnd(wed)
    expect(ws.getDay()).toBe(1) // Monday
    expect(we.getDay()).toBe(0) // Sunday
    expect(ws.getDate()).toBe(11)
    expect(we.getDate()).toBe(17)
  })
})

describe('groupBusyByCalendar', () => {
  it('keys events by calendar_id', () => {
    const events = [
      ev('cal-a', 2026, 5, 11, 9, 0, 10, 0),
      ev('cal-a', 2026, 5, 11, 14, 0, 15, 0),
      ev('cal-b', 2026, 5, 11, 9, 0, 10, 0)
    ]
    const map = groupBusyByCalendar(events)
    expect(map.get('cal-a')).toHaveLength(2)
    expect(map.get('cal-b')).toHaveLength(1)
  })
})

describe('findCommonFreeSlots', () => {
  it('finds windows when all calendars are free', () => {
    // Two calendars. cal-a has 9-10 + 14-15 booked. cal-b has 11-12 booked.
    // Looking for 30-min slots on Mon 2026-05-11 between 9-20.
    const events = [
      ev('cal-a', 2026, 5, 11,  9, 0, 10, 0),
      ev('cal-a', 2026, 5, 11, 14, 0, 15, 0),
      ev('cal-b', 2026, 5, 11, 11, 0, 12, 0)
    ]
    const slots = findCommonFreeSlots({
      busyByCalendarId: groupBusyByCalendar(events),
      calendarIds: ['cal-a', 'cal-b'],
      durationMinutes: 30,
      from: at(2026, 5, 11, 9, 0),
      to:   at(2026, 5, 11, 20, 0),
      stepMinutes: 30
    })
    // Slot at 10:00–10:30 should be free (cal-a frees at 10, cal-b free until 11)
    expect(slots.find(s => s.start.getHours() === 10 && s.start.getMinutes() === 0)).toBeTruthy()
    // Slot at 9:00–9:30 should NOT be free (cal-a busy 9-10)
    expect(slots.find(s => s.start.getHours() === 9 && s.start.getMinutes() === 0)).toBeFalsy()
    // Slot at 14:00–14:30 should NOT be free (cal-a busy 14-15)
    expect(slots.find(s => s.start.getHours() === 14 && s.start.getMinutes() === 0)).toBeFalsy()
    // Slot at 15:00–15:30 should be free again
    expect(slots.find(s => s.start.getHours() === 15 && s.start.getMinutes() === 0)).toBeTruthy()
  })

  it('respects working-hours bounds', () => {
    const slots = findCommonFreeSlots({
      busyByCalendarId: new Map(),
      calendarIds: ['cal-a'],
      durationMinutes: 30,
      from: at(2026, 5, 11, 0, 0),
      to:   at(2026, 5, 12, 0, 0),
      workingHours: { start: 10, end: 12 }
    })
    expect(slots.length).toBeGreaterThan(0)
    for (const s of slots) {
      expect(s.start.getHours()).toBeGreaterThanOrEqual(10)
      expect(s.end.getHours() * 60 + s.end.getMinutes()).toBeLessThanOrEqual(12 * 60)
    }
  })

  it('returns empty when no calendars selected', () => {
    expect(findCommonFreeSlots({
      busyByCalendarId: new Map(),
      calendarIds: [],
      durationMinutes: 30,
      from: at(2026, 5, 11, 9, 0),
      to:   at(2026, 5, 12, 9, 0)
    })).toEqual([])
  })

  it('rejects slots that do not fully fit before workEnd', () => {
    // 19:30-20:00 is the LAST 30-min slot of the workday. 19:45 onwards
    // should not appear because it would end at 20:15.
    const slots = findCommonFreeSlots({
      busyByCalendarId: new Map(),
      calendarIds: ['cal-a'],
      durationMinutes: 30,
      from: at(2026, 5, 11, 19, 0),
      to:   at(2026, 5, 11, 23, 0),
      stepMinutes: 15
    })
    const last = slots[slots.length - 1]
    expect(last.end.getHours() * 60 + last.end.getMinutes()).toBeLessThanOrEqual(20 * 60)
  })
})

describe('layoutDayColumn', () => {
  it('places non-overlapping events in lane 0', () => {
    const events = [
      ev('c', 2026, 5, 11,  9, 0, 10, 0),
      ev('c', 2026, 5, 11, 11, 0, 12, 0)
    ]
    const out = layoutDayColumn(events)
    expect(out).toHaveLength(2)
    expect(out.every(e => e._lane === 0)).toBe(true)
    expect(out.every(e => e._lanes === 1)).toBe(true)
  })

  it('places overlapping events in adjacent lanes', () => {
    const events = [
      ev('c', 2026, 5, 11, 9, 0, 11, 0),
      ev('c', 2026, 5, 11, 10, 0, 12, 0)
    ]
    const out = layoutDayColumn(events)
    expect(out).toHaveLength(2)
    expect(new Set(out.map(e => e._lane))).toEqual(new Set([0, 1]))
    expect(out.every(e => e._lanes === 2)).toBe(true)
  })

  it('reuses a freed lane after a non-overlapping event', () => {
    // 9-10, 9:30-10:30 → lanes 0 and 1, lanes total = 2
    // Then 11-12 → can reuse lane 0, lanes total still 2
    const events = [
      ev('c', 2026, 5, 11,  9,  0, 10,  0),
      ev('c', 2026, 5, 11,  9, 30, 10, 30),
      ev('c', 2026, 5, 11, 11,  0, 12,  0)
    ]
    const out = layoutDayColumn(events)
    const third = out.find(e => new Date(e.starts_at).getHours() === 11)
    expect(third._lane).toBe(0)
    expect(out.every(e => e._lanes === 2)).toBe(true)
  })
})

describe('personByEmail', () => {
  const people = [
    { id: 'p1', email: 'arvind@crescentpharma.in', full_name: 'Arvind Kulkarni' },
    { id: 'p2', email: 'manav@saffronstudios.in',  full_name: 'Manav Kapoor' }
  ]

  it('matches case-insensitively', () => {
    expect(personByEmail(people, 'ARVIND@crescentpharma.in')?.id).toBe('p1')
    expect(personByEmail(people, '  manav@saffronstudios.in  ')?.id).toBe('p2')
  })

  it('returns null for unknown emails', () => {
    expect(personByEmail(people, 'unknown@example.com')).toBeNull()
  })

  it('handles empty / null input', () => {
    expect(personByEmail(people, null)).toBeNull()
    expect(personByEmail(people, '')).toBeNull()
    expect(personByEmail([], 'arvind@crescentpharma.in')).toBeNull()
    expect(personByEmail(null, 'arvind@crescentpharma.in')).toBeNull()
  })
})

describe('attendeesWithPersonas', () => {
  const people = [{ id: 'p1', email: 'arvind@crescentpharma.in', full_name: 'Arvind Kulkarni', role: 'CEO' }]

  it('crosswalks attendee objects to People rows', () => {
    const event = { attendees: [{ email: 'arvind@crescentpharma.in', name: 'Arvind' }] }
    const out = attendeesWithPersonas(event, people)
    expect(out).toHaveLength(1)
    expect(out[0].person.id).toBe('p1')
    expect(out[0].name).toBe('Arvind')
  })

  it('handles attendee strings (email-only)', () => {
    const event = { attendees: ['arvind@crescentpharma.in'] }
    const out = attendeesWithPersonas(event, people)
    expect(out[0].person.id).toBe('p1')
  })

  it('returns null person for unmatched attendees', () => {
    const event = { attendees: [{ email: 'unknown@example.com' }] }
    const out = attendeesWithPersonas(event, people)
    expect(out[0].person).toBeNull()
  })
})

describe('colorClassesFor', () => {
  it('returns blue for unknown colour names (defensive default)', () => {
    expect(colorClassesFor('chartreuse')).toEqual(colorClassesFor('blue'))
  })
})
