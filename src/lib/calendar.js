// Google Calendar "Add to calendar" helper — produces a URL that prefills the
// event in the user's Google account. No server-side integration required.

function pad(n) { return String(n).padStart(2, '0') }

function toGcalDate(date, time, durationMin = 30) {
  // date: 'YYYY-MM-DD', time: 'HH:MM'
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm]  = time.split(':').map(Number)
  const start = new Date(y, m - 1, d, hh, mm)
  const end   = new Date(start.getTime() + durationMin * 60 * 1000)
  const fmt = (dt) =>
    `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`
  return `${fmt(start)}/${fmt(end)}`
}

export function googleCalendarUrl({ title, date, time, attendeeEmail, details }) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: toGcalDate(date, time),
    details: details || '',
    add: attendeeEmail || ''
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
