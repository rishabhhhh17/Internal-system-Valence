// Bridge content script.
//
// Runs only on https://valenceos.vercel.app/*. Its job is to grab the
// signed-in user's Supabase session (stored in localStorage by the
// supabase-js client) and forward it to the extension's background
// worker, so the worker can authenticate /api/capture calls with the
// user's JWT.
//
// Why this approach: we don't ship a separate OAuth client for the
// extension. Whatever user is signed in to the web app *is* the user the
// extension captures into. Connect = open valenceos.vercel.app once and
// be signed in. Sign out wipes the session here too.
//
// We re-poll periodically because the user might sign in / refresh
// tokens after the page loads.

const SUPABASE_PROJECT = 'xwbownhncfthjmxceqrt'
const STORAGE_KEY = `sb-${SUPABASE_PROJECT}-auth-token`
let lastSentToken = null

function readSession() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // supabase-js stores the session under the key. Shape:
    //   { access_token, refresh_token, expires_at, user, ... }
    // Some versions wrap it in { currentSession: ... } — handle both.
    const s = parsed?.currentSession || parsed
    if (!s?.access_token) return null
    return s
  } catch {
    return null
  }
}

function forward() {
  const s = readSession()
  const token = s?.access_token || null
  if (token === lastSentToken) return
  lastSentToken = token
  try {
    chrome.runtime.sendMessage({ type: 'SET_SESSION', session: s }, () => {
      // Drop the lastError — extension may have been reloaded.
      void chrome.runtime.lastError
    })
  } catch { /* extension context invalidated — page reload will fix */ }
}

// Initial pickup + periodic re-check. We don't aggressively poll because
// the localStorage key changes on token refresh and refresh is rare
// (every ~hour).
forward()
setInterval(forward, 30_000)
// Re-check on focus too — user clicked back to the app, may have just signed in.
window.addEventListener('focus', forward)
window.addEventListener('storage', (e) => { if (e.key === STORAGE_KEY) forward() })
