// Google API helpers — talk to Calendar, Drive and Gmail using the provider
// access token that Supabase stores inside the current session.
//
// Token refresh caveat: Supabase does not re-request Google's access token
// when its own JWT refreshes. After ~1 hour the stored provider_token goes
// stale. Every helper below surfaces a GoogleAuthExpired error on 401 so the
// UI can prompt the user to reconnect.

import { supabase, isSupabaseConfigured } from './supabase.js'

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  // Read-only header access — powers the deal drawer's "Sync Gmail" feature.
  // We never read bodies; metadataHeaders is limited to From/To/CC/Date/Subject.
  'https://www.googleapis.com/auth/gmail.metadata',
  'openid', 'email', 'profile'
].join(' ')

export class GoogleAuthExpired extends Error {
  constructor() { super('Google session expired. Please reconnect.') }
}

export async function signInWithGoogle({ redirectTo } = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.')
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: GOOGLE_SCOPES,
      queryParams: { access_type: 'offline', prompt: 'consent' },
      redirectTo: redirectTo || window.location.origin
    }
  })
  if (error) throw error
}

export async function signOut() {
  if (!isSupabaseConfigured) return
  await supabase.auth.signOut()
}

export async function currentSession() {
  if (!isSupabaseConfigured) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}

export async function googleToken() {
  const s = await currentSession()
  return s?.provider_token || null
}

async function gfetch(url, { method = 'GET', headers = {}, body, json = true } = {}) {
  const token = await googleToken()
  if (!token) throw new GoogleAuthExpired()
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body && json ? { 'Content-Type': 'application/json' } : {}),
      ...headers
    },
    body: body && json ? JSON.stringify(body) : body
  })
  if (res.status === 401) throw new GoogleAuthExpired()
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Google API ${res.status}: ${txt || res.statusText}`)
  }
  if (res.status === 204) return null
  return res.json()
}

// ============ CALENDAR ============

export async function listTodayEvents() {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const end   = new Date(); end.setHours(23, 59, 59, 999)
  return listEventsBetween(start, end)
}

export async function listEventsBetween(start, end, calendarId = 'primary') {
  const params = new URLSearchParams({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50'
  })
  const data = await gfetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`)
  return (data.items || []).map(normaliseEvent)
}

function normaliseEvent(ev) {
  const start = ev.start?.dateTime || ev.start?.date
  const end   = ev.end?.dateTime   || ev.end?.date
  return {
    id: ev.id,
    summary: ev.summary || '(no title)',
    description: ev.description || '',
    location: ev.location || '',
    htmlLink: ev.htmlLink,
    attendees: (ev.attendees || []).map(a => ({ email: a.email, name: a.displayName, response: a.responseStatus })),
    organizer: ev.organizer,
    status: ev.status,
    allDay: Boolean(ev.start?.date),
    start: start ? new Date(start) : null,
    end:   end   ? new Date(end)   : null,
    raw: ev
  }
}

export async function createCalendarEvent({ title, description = '', start, end, attendees = [], calendarId = 'primary' }) {
  const body = {
    summary: title,
    description,
    start: { dateTime: start.toISOString() },
    end:   { dateTime: end.toISOString() },
    attendees: attendees.map(a => ({ email: a }))
  }
  const data = await gfetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`,
    { method: 'POST', body }
  )
  return normaliseEvent(data)
}

// ============ GMAIL ============

function base64Url(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function sendGmail({ to, subject, body, cc = [], bcc = [] }) {
  const headers = [
    `To: ${to}`,
    cc.length  ? `Cc: ${cc.join(', ')}`   : null,
    bcc.length ? `Bcc: ${bcc.join(', ')}` : null,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=UTF-8',
    'MIME-Version: 1.0'
  ].filter(Boolean).join('\r\n')
  const raw = base64Url(`${headers}\r\n\r\n${body}`)
  return gfetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    body: { raw }
  })
}

export async function createGmailDraft({ to, subject, body, cc = [], bcc = [] }) {
  const headers = [
    `To: ${to}`,
    cc.length  ? `Cc: ${cc.join(', ')}`   : null,
    bcc.length ? `Bcc: ${bcc.join(', ')}` : null,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=UTF-8',
    'MIME-Version: 1.0'
  ].filter(Boolean).join('\r\n')
  const raw = base64Url(`${headers}\r\n\r\n${body}`)
  return gfetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    body: { message: { raw } }
  })
}

// ============ DRIVE ============

export async function listDriveFiles({ q = '', pageSize = 40 } = {}) {
  const queryParts = ["trashed = false"]
  if (q) queryParts.push(`name contains '${q.replace(/'/g, "\\'")}'`)
  const params = new URLSearchParams({
    pageSize: String(pageSize),
    q: queryParts.join(' and '),
    fields: 'files(id,name,mimeType,iconLink,webViewLink,modifiedTime,size,owners(displayName,photoLink))',
    orderBy: 'modifiedTime desc'
  })
  const data = await gfetch(`https://www.googleapis.com/drive/v3/files?${params}`)
  return data.files || []
}

// ============ FREE SLOTS ============

// Compute hour-aligned free slots in the workday from today's events.
export function computeFreeSlots(events, { workStart = 9, workEnd = 19, now = new Date() } = {}) {
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const slots = []
  for (let h = workStart; h < workEnd; h++) {
    const s = new Date(today); s.setHours(h, 0, 0, 0)
    const e = new Date(today); e.setHours(h + 1, 0, 0, 0)
    if (e.getTime() <= now.getTime()) continue
    const conflict = (events || []).some(ev => ev.start && ev.end && ev.start < e && ev.end > s && !ev.allDay)
    if (!conflict) slots.push({ start: s, end: e })
  }
  return slots
}
