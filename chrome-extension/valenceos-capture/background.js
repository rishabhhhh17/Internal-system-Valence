// ValenceOS Capture — service worker.
//
// Responsibilities:
//   1. Holds the Supabase JWT (received from the web app via the bridge
//      content script) and persists it to chrome.storage.local.
//   2. Receives capture requests from gmail.js / calendar.js content
//      scripts, posts them to /api/capture on the web app with the JWT,
//      and pipes the response back so the in-page chip can show the
//      result.
//   3. Listens for SESSION messages from the bridge content script — when
//      the user is signed in on valenceos.vercel.app, the bridge forwards
//      their JWT here so capture works in one click.

const API_BASE = 'https://valenceos.vercel.app'
const SESSION_KEY = 'valenceos.session'

// ============ STORAGE ============
async function getSession() {
  const out = await chrome.storage.local.get(SESSION_KEY)
  return out[SESSION_KEY] || null
}
async function setSession(session) {
  if (session) await chrome.storage.local.set({ [SESSION_KEY]: session })
  else await chrome.storage.local.remove(SESSION_KEY)
}

// ============ CAPTURE ============
async function postCapture(payload) {
  const session = await getSession()
  if (!session?.access_token) {
    return { ok: false, status: 401, error: 'Not connected to ValenceOS. Open the extension and click Connect.' }
  }
  try {
    const res = await fetch(`${API_BASE}/api/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'x-extension-version': chrome.runtime.getManifest().version
      },
      body: JSON.stringify(payload)
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      // 401 → session likely expired; clear it so the popup prompts a reconnect.
      if (res.status === 401) await setSession(null)
      return { ok: false, status: res.status, error: json?.error || `HTTP ${res.status}` }
    }
    return { ok: true, status: res.status, data: json }
  } catch (err) {
    return { ok: false, status: 0, error: err?.message || 'Network error' }
  }
}

// ============ MESSAGE ROUTER ============
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Asynchronous responses — return true so the channel stays open.
  ;(async () => {
    try {
      switch (msg?.type) {
        case 'GET_SESSION': {
          const s = await getSession()
          sendResponse({ ok: true, connected: Boolean(s?.access_token), email: s?.user?.email || null })
          return
        }
        case 'SET_SESSION': {
          // Forwarded by the bridge content script when the user is on
          // valenceos.vercel.app and signed in.
          await setSession(msg.session || null)
          sendResponse({ ok: true })
          return
        }
        case 'CLEAR_SESSION': {
          await setSession(null)
          sendResponse({ ok: true })
          return
        }
        case 'CAPTURE': {
          // payload: { kind, ... } — see content/gmail.js + content/calendar.js
          const result = await postCapture(msg.payload)
          sendResponse(result)
          return
        }
        case 'PING': {
          sendResponse({ ok: true, version: chrome.runtime.getManifest().version })
          return
        }
        default:
          sendResponse({ ok: false, error: `Unknown message type: ${msg?.type}` })
      }
    } catch (err) {
      sendResponse({ ok: false, error: err?.message || 'Worker error' })
    }
  })()
  return true // keep channel open for async sendResponse
})
