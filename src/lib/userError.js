// userError — translate raw Postgres / Supabase / network errors into
// messages a non-engineer can act on.
//
// Every catch block in the app used to do `toast.error(err.message)`,
// which leaked "duplicate key value violates unique constraint" /
// "permission denied for relation X" / "new row violates row-level
// security policy" straight to the user. Looks broken + leaks schema.
//
// Use this everywhere user-facing:
//
//   import { humanError } from '../lib/userError.js'
//   try { ... } catch (err) {
//     toast.error(humanError(err))     // friendly + safe
//   }
//
// Add new patterns to PATTERNS as we discover them in real usage. The
// raw error still goes to console.warn so we don't lose debug info.

const PATTERNS = [
  // Postgres constraint violations
  { match: /duplicate key value violates unique constraint/i,         msg: 'That value is already in use. Try a different one.' },
  { match: /violates foreign key constraint/i,                        msg: "That record can't be removed while it's still linked to something else." },
  { match: /violates check constraint/i,                              msg: "That value isn't allowed. Check the format and try again." },
  { match: /violates not[- ]null constraint/i,                        msg: 'A required field is missing.' },

  // RLS and permissions
  { match: /violates row[- ]level security policy/i,                  msg: "You don't have permission to do that." },
  { match: /permission denied for (relation|table|function|schema|column)/i, msg: 'Access denied — your admin needs to grant you that permission.' },
  { match: /insufficient_privilege/i,                                 msg: "You don't have permission for that action." },

  // Schema / version mismatch
  { match: /function .* does not exist/i,                             msg: 'The server is missing this feature — refresh the page and try again.' },
  { match: /column .* does not exist/i,                               msg: "The app is out of sync with the server — refresh the page." },
  { match: /relation .* does not exist/i,                             msg: "The app is out of sync with the server — refresh the page." },

  // Auth + session
  { match: /jwt expired|token has expired/i,                          msg: 'Your session expired — sign in again.' },
  { match: /jwt invalid|invalid (jwt|token)/i,                        msg: 'Your sign-in is invalid — sign out and back in.' },
  { match: /not authenticated|missing.*bearer/i,                      msg: "You're not signed in — sign in and try again." },
  { match: /unauthorized/i,                                           msg: 'Unauthorised — sign in or contact your admin.' },

  // Network
  { match: /failed to fetch|network ?error|networkerror/i,            msg: 'Connection issue — check your internet and try again.' },
  { match: /timeout|timed out/i,                                      msg: 'The server took too long to respond — try again.' },

  // Storage
  { match: /payload too large|file too large|exceeds.*size limit/i,   msg: 'That file is too large to upload.' },
  { match: /storage.*quota/i,                                         msg: "Your storage quota is full — clear some files first." },

  // Invite-flow specifics
  { match: /invite (not found|already claimed|expired|already used)/i, msg: 'That invite code is invalid or has been used. Ask your admin for a new one.' },
  { match: /user already belongs to a team/i,                         msg: "You're already on a team. Sign out first to join another." },
  { match: /only admins/i,                                            msg: 'Only firm admins can do that.' },
  { match: /no active seat/i,                                         msg: 'You need to finish onboarding first.' },

  // Gemini / LLM
  { match: /gemini.*not configured|GEMINI_API_KEY/i,                  msg: 'AI features aren\'t connected yet — ask your admin to set the API key.' },
  { match: /quota|rate limit/i,                                       msg: "We're being rate-limited by the AI provider — try again in a moment." }
]

const DEFAULT_FALLBACK = 'Something went wrong — try again or contact your admin if it keeps happening.'

export function humanError(err, fallback = DEFAULT_FALLBACK) {
  const raw = String(err?.message || err || '').trim()
  if (!raw) return fallback
  for (const { match, msg } of PATTERNS) {
    if (match.test(raw)) return msg
  }
  // Log the unmapped raw error so we learn what to add next — never
  // shown to the user, only to the developer console.
  if (typeof console !== 'undefined' && console.warn) {
    console.warn('[userError] unmapped raw error:', raw)
  }
  return fallback
}

// Convenience for places that want both the friendly text AND the raw
// for logging. Returns { user, raw }.
export function splitError(err) {
  const raw = String(err?.message || err || '')
  return { user: humanError(err), raw }
}
