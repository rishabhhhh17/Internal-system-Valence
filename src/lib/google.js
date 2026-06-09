// Google API helpers — talk to Calendar, Drive and Gmail using the provider
// access token that Supabase stores inside the current session.
//
// Token refresh strategy: Supabase v2 stores both `provider_token` (the
// short-lived Google access token) and `provider_refresh_token`. On a 401
// we call `supabase.auth.refreshSession()` once — recent versions exchange
// the refresh token for a fresh access token. If the retry still 401s we
// surface GoogleAuthExpired so the UI can prompt a re-consent.

import { supabase, isSupabaseConfigured } from './supabase.js'

// ── Provider-token persistence ──────────────────────────────────────────
// Supabase only exposes `provider_token` / `provider_refresh_token` on the
// session object IN MEMORY right after the OAuth redirect — it strips them
// from the session it persists to storage. So on the next page load (or
// after a TOKEN_REFRESHED event, which hands back a session with no
// provider_token), `session.provider_token` is null and the app wrongly
// decides Google is "disconnected" and prompts a reconnect. We fix that by
// stashing the Google token ourselves the moment it appears and serving it
// from here until it expires. Stored under the `valence.` namespace so the
// signOut() sweep clears it with everything else.
const GT_KEY = 'valence.google.provider_token'
const GR_KEY = 'valence.google.provider_refresh_token'
const GE_KEY = 'valence.google.provider_expires_at'

// Capture provider tokens off a freshly-minted session (SIGNED_IN / initial
// callback / a refresh that happened to include them). No-op when the
// session carries no provider_token, so it never clobbers a good stored
// token with a blank one from a plain TOKEN_REFRESHED event.
export function rememberGoogleTokens(session) {
  try {
    if (!session || typeof window === 'undefined' || !window.localStorage) return
    if (session.provider_token) {
      window.localStorage.setItem(GT_KEY, session.provider_token)
      // Google access tokens live ~3600s. Stash a slightly-conservative
      // expiry so we stop serving it just before Google would 401.
      window.localStorage.setItem(GE_KEY, String(Date.now() + 55 * 60 * 1000))
    }
    if (session.provider_refresh_token) {
      window.localStorage.setItem(GR_KEY, session.provider_refresh_token)
    }
  } catch { /* private mode / quota — graceful degrade */ }
}

// Returns the stored Google access token if we have one and it hasn't
// expired, else null.
export function storedGoogleToken() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    const t = window.localStorage.getItem(GT_KEY)
    const exp = Number(window.localStorage.getItem(GE_KEY) || 0)
    if (t && exp && Date.now() < exp) return t
  } catch { /* ignore */ }
  return null
}

export function clearGoogleTokens() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.removeItem(GT_KEY)
    window.localStorage.removeItem(GR_KEY)
    window.localStorage.removeItem(GE_KEY)
  } catch { /* ignore */ }
}

export function storedGoogleRefreshToken() {
  try { return window.localStorage?.getItem(GR_KEY) || null } catch { return null }
}

// True when we can reach Google: a live in-session token, a valid stored
// access token, OR a stored refresh token (we can mint a fresh access token
// from it on demand via /api/google-refresh).
export function hasGoogleConnection(session) {
  return Boolean(session?.provider_token) || Boolean(storedGoogleToken()) || Boolean(storedGoogleRefreshToken())
}

// Mint a fresh Google access token from the stored refresh token via the
// server endpoint (Supabase won't refresh provider tokens itself). De-duped
// so a burst of simultaneous 401s triggers exactly one network refresh.
let _refreshInflight = null
export async function refreshGoogleAccessToken() {
  if (_refreshInflight) return _refreshInflight
  _refreshInflight = (async () => {
    const refresh = storedGoogleRefreshToken()
    if (!refresh) return null
    try {
      const res = await fetch('/api/google-refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.access_token) {
        // 401 = refresh token revoked/expired → drop the stash so the UI
        // prompts a genuine reconnect. Other errors (config/network) leave
        // the stash intact so a transient blip doesn't nuke the connection.
        if (res.status === 401) clearGoogleTokens()
        return null
      }
      try {
        window.localStorage.setItem(GT_KEY, data.access_token)
        const ttlMs = (Number(data.expires_in) || 3600) * 1000
        window.localStorage.setItem(GE_KEY, String(Date.now() + ttlMs - 60_000)) // 60s safety margin
      } catch { /* private mode */ }
      return data.access_token
    } catch {
      return null
    }
  })()
  try { return await _refreshInflight } finally { _refreshInflight = null }
}

// Scopes intentionally kept to Calendar + Drive + Tasks only. Gmail scopes
// (gmail.send, gmail.metadata) are RESTRICTED scopes that trigger Google's
// CASA security audit ($10-15k, 4-8 weeks) during OAuth verification. The
// Chrome extension covers Gmail capture by reading the user's open Gmail
// tab (DOM, not API), and EmailComposer / Planner / FreeSlots now open
// Gmail's compose URL in a new tab instead of sending via the API — no
// scope needed for either path. If a future feature genuinely needs the
// Gmail API, re-add the scope here AND budget for CASA before re-submitting.
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive.readonly',
  // Read + write the user's Google Tasks so the Day Planner Tasks panel
  // can be the source of truth for the partner's to-do list.
  'https://www.googleapis.com/auth/tasks',
  'openid', 'email', 'profile'
].join(' ')

export class GoogleAuthExpired extends Error {
  constructor() { super('Google session expired. Please reconnect.') }
}

export async function signInWithGoogle({ redirectTo } = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.')
  // Default to the user's current URL so they land back exactly where they
  // were after the OAuth round-trip, not at "/". Callers can override.
  const fallback = typeof window !== 'undefined' ? window.location.href : '/'
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: GOOGLE_SCOPES,
      // access_type=offline   → Google returns a refresh token (needed for
      //                         refreshSession() on 401).
      // prompt=select_account → forces the Google account picker every
      //                         time. Without this, if the user has a
      //                         single Google account signed in to Chrome,
      //                         Google silently reuses it — meaning a
      //                         user who wants to switch accounts can't,
      //                         and ends up signed in as their previous
      //                         identity (avatar carries over, etc.).
      // prompt=consent        → also re-prompts for scope consent, which
      //                         guarantees the refresh token comes back.
      queryParams: { access_type: 'offline', prompt: 'select_account consent' },
      redirectTo: redirectTo || fallback
    }
  })
  if (error) throw error
}

export async function signOut() {
  if (!isSupabaseConfigured) return
  await supabase.auth.signOut()
  // SECURITY: also clear all user-bound state from localStorage.
  // supabase.auth.signOut() removes the Supabase session, but the app
  // stores other personal data under the `valence.` namespace:
  //   - BYO API keys for Gemini / OpenAI / Anthropic / custom
  //     (valence.settings.llm.key.*, valence.settings.geminiKey)
  //   - Active provider + model + base URL preferences
  //   - Active org / seat IDs cached for AI meter tracking
  // Without this sweep, the next person who signs in on the same
  // browser inherits the previous user's API keys and org context —
  // a real privacy + billing leak on shared machines.
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const drop = []
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i)
        if (k && k.startsWith('valence.')) drop.push(k)
      }
      drop.forEach(k => window.localStorage.removeItem(k))
    }
  } catch { /* private mode / quota — graceful degrade */ }
}

export async function currentSession() {
  if (!isSupabaseConfigured) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}

export async function googleToken() {
  const s = await currentSession()
  // Prefer the live in-session token; fall back to the one we stashed at
  // sign-in so the connection survives reloads + TOKEN_REFRESHED events.
  if (s?.provider_token) {
    rememberGoogleTokens(s)
    return s.provider_token
  }
  const stored = storedGoogleToken()
  if (stored) return stored
  // No live/stored access token — mint one from the refresh token.
  return await refreshGoogleAccessToken()
}

async function gfetch(url, { method = 'GET', headers = {}, body, json = true } = {}) {
  const initialToken = await googleToken()
  if (!initialToken) throw new GoogleAuthExpired()

  const buildInit = (token) => ({
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body && json ? { 'Content-Type': 'application/json' } : {}),
      ...headers
    },
    body: body && json ? JSON.stringify(body) : body
  })

  let res = await fetch(url, buildInit(initialToken))

  // 401 → mint a fresh Google access token from the refresh token (via the
  // server endpoint) and retry once. Supabase's own refreshSession does NOT
  // refresh provider tokens, so we go straight to Google. refreshGoogleAccessToken
  // clears the stash on a revoked refresh token, so a real expiry surfaces as
  // "Reconnect Google"; a transient error keeps the connection.
  if (res.status === 401) {
    const fresh = await refreshGoogleAccessToken()
    if (fresh && fresh !== initialToken) {
      res = await fetch(url, buildInit(fresh))
    }
    if (res.status === 401) {
      clearGoogleTokens()
      throw new GoogleAuthExpired()
    }
  }

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

// List every calendar the signed-in user has access to — their own primary
// + any calendar shared with them. Used by the Team Calendar auto-import
// flow so the partner doesn't have to type Google Calendar IDs by hand.
// `accessRole` tells us how much they can do with it (owner / writer /
// reader / freeBusyReader). We surface free-busy too, since that's enough
// to draw busy blocks on the overlay even without event details.
export async function listCalendarsAccessible() {
  const params = new URLSearchParams({
    minAccessRole: 'freeBusyReader',
    maxResults: '100',
    showHidden: 'false'
  })
  const data = await gfetch(`https://www.googleapis.com/calendar/v3/users/me/calendarList?${params}`)
  return (data.items || []).map(c => ({
    id:           c.id,
    summary:      c.summary || c.summaryOverride || c.id,
    description:  c.description || '',
    accessRole:   c.accessRole,                  // owner | writer | reader | freeBusyReader
    primary:      Boolean(c.primary),
    backgroundColor: c.backgroundColor || null
  }))
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

export async function createCalendarEvent({ title, description = '', location = '', start, end, attendees = [], withMeet = false, calendarId = 'primary' }) {
  const body = {
    summary: title,
    description,
    location: location || undefined,
    start: { dateTime: start.toISOString() },
    end:   { dateTime: end.toISOString() },
    attendees: attendees.map(a => ({ email: a }))
  }
  // Attach a Google Meet link if requested. Requires
  // conferenceDataVersion=1 so the API actually provisions a hangoutsMeet
  // entry rather than silently dropping it.
  if (withMeet) {
    body.conferenceData = {
      createRequest: {
        requestId: `vlc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' }
      }
    }
  }
  const params = new URLSearchParams({ sendUpdates: 'all' })
  if (withMeet) params.set('conferenceDataVersion', '1')
  const data = await gfetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { method: 'POST', body }
  )
  return normaliseEvent(data)
}

// ============ GMAIL ============

function base64Url(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Gmail handoff helpers. Both open Gmail's compose URL in a new tab with
// the to/subject/body pre-filled — the user hits "Send" themselves. No
// Gmail API call, no gmail.send scope needed, which keeps us out of
// Google's CASA audit. Async signature preserved so call sites can keep
// awaiting them without churn.
//
// One downside vs the old API path: we can't distinguish "saved as draft"
// from "sent" — Gmail's compose URL always opens an editable draft, and
// the user controls whether to send. Callers should phrase their toast
// as "Opened in Gmail to send" rather than "Sent".

export async function sendGmail({ to, subject, body, cc = [], bcc = [] }) {
  return openGmailCompose({ to, subject, body, cc, bcc })
}

export async function createGmailDraft({ to, subject, body, cc = [], bcc = [] }) {
  return openGmailCompose({ to, subject, body, cc, bcc })
}

export function openGmailCompose({ to, subject, body, cc = [], bcc = [] } = {}) {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams({ view: 'cm', fs: '1' })
  if (to)      params.set('to',  Array.isArray(to)  ? to.join(',')  : to)
  if (cc?.length)  params.set('cc',  cc.join(','))
  if (bcc?.length) params.set('bcc', bcc.join(','))
  if (subject) params.set('su', subject)
  if (body)    params.set('body', body)
  // Open Gmail compose in a new tab. The user lands directly in a draft
  // editor with everything filled in and clicks Send themselves.
  const url = `https://mail.google.com/mail/?${params.toString()}`
  window.open(url, '_blank', 'noopener,noreferrer')
  return { opened: true, url }
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

// ============ GOOGLE TASKS ============
// Wraps the Google Tasks API (tasks.googleapis.com/tasks/v1). Operates on
// the user's default task list — we don't surface multi-list management
// because the Day Planner panel is a single inbox, not a project tool.
// Every response has `source: 'google'` tagged on so the Planner can tell
// Google rows apart from local Supabase rows when merging.

const TASKS_BASE = 'https://tasks.googleapis.com/tasks/v1'

async function defaultTaskListId() {
  const data = await gfetch(`${TASKS_BASE}/users/@me/lists?maxResults=1`)
  return data.items?.[0]?.id || '@default'
}

function normalizeGoogleTask(t, listId) {
  // Google's `due` is RFC3339; we keep just the date portion to align with
  // our local `due_date` (yyyy-MM-dd) for sorting/grouping.
  let due_date = null
  if (t.due) {
    try { due_date = String(t.due).slice(0, 10) } catch { /* leave null */ }
  }
  return {
    id: `gtask:${t.id}`,
    google_task_id: t.id,
    google_task_list_id: listId,
    source: 'google',
    title: t.title || '',
    notes: t.notes || '',
    due_date,
    completed: t.status === 'completed',
    completed_at: t.completed || null,
    created_at: t.updated || null,
    updated_at: t.updated || null
  }
}

export async function listGoogleTasks() {
  const listId = await defaultTaskListId()
  // showCompleted=true so we can render the "Done" section. showHidden
  // is left false — that's Google's archive bucket; not a partner-facing
  // concern.
  const params = new URLSearchParams({
    maxResults: '100',
    showCompleted: 'true',
    showHidden: 'false'
  })
  const data = await gfetch(`${TASKS_BASE}/lists/${encodeURIComponent(listId)}/tasks?${params}`)
  return (data.items || []).map(t => normalizeGoogleTask(t, listId))
}

export async function createGoogleTask({ title, notes = '', due_date = null } = {}) {
  if (!title || !title.trim()) throw new Error('Task title is required')
  const listId = await defaultTaskListId()
  const body = { title: title.trim() }
  if (notes && notes.trim()) body.notes = notes.trim()
  if (due_date) {
    // Google wants RFC3339; encode at midnight UTC so it round-trips with
    // our YYYY-MM-DD storage.
    body.due = `${due_date}T00:00:00.000Z`
  }
  const data = await gfetch(`${TASKS_BASE}/lists/${encodeURIComponent(listId)}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return normalizeGoogleTask(data, listId)
}

export async function toggleGoogleTask(task) {
  if (!task?.google_task_id || !task?.google_task_list_id) {
    throw new Error('Not a Google task')
  }
  const nextStatus = task.completed ? 'needsAction' : 'completed'
  const data = await gfetch(`${TASKS_BASE}/lists/${encodeURIComponent(task.google_task_list_id)}/tasks/${encodeURIComponent(task.google_task_id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: nextStatus })
  })
  return normalizeGoogleTask(data, task.google_task_list_id)
}

export async function deleteGoogleTask(task) {
  if (!task?.google_task_id || !task?.google_task_list_id) {
    throw new Error('Not a Google task')
  }
  await gfetch(`${TASKS_BASE}/lists/${encodeURIComponent(task.google_task_list_id)}/tasks/${encodeURIComponent(task.google_task_id)}`, {
    method: 'DELETE'
  })
  return true
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
