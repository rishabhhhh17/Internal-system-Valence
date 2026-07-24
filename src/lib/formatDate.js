// Safe date formatting. date-fns v4's format() THROWS `RangeError: Invalid
// time value` on an Invalid Date (it does not return a fallback string), so a
// single bad/missing date in a render path can white-screen a whole page.
// fmtDate() never throws — it returns `fallback` for null/empty/invalid input.
import { format, parseISO } from 'date-fns'

export function fmtDate(value, pattern = 'd MMM yyyy', fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback
  let d
  try {
    if (value instanceof Date) d = value
    else if (typeof value === 'string') {
      d = parseISO(value)
      if (Number.isNaN(d.getTime())) d = new Date(value) // non-ISO string fallback
    } else {
      d = new Date(value) // number / timestamp
    }
  } catch {
    return fallback
  }
  return (d && !Number.isNaN(d.getTime())) ? format(d, pattern) : fallback
}
