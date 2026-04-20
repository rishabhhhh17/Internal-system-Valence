// Sentry init. No-ops if VITE_SENTRY_DSN is not set so local dev stays quiet.
// Keep this file tiny — if the DSN is missing we don't even import @sentry/react
// to avoid pulling the SDK into the bundle for users who don't use it.

const DSN = import.meta.env.VITE_SENTRY_DSN

export async function initSentry() {
  if (!DSN) return null
  const Sentry = await import('@sentry/react')
  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION || 'dev',
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: false, blockAllMedia: true })
    ],
    beforeSend(event) {
      // Scrub anything that looks like a Supabase anon key (JWT) or Google OAuth token.
      try {
        const s = JSON.stringify(event)
        if (/eyJ[A-Za-z0-9_-]{20,}\./.test(s) || /ya29\.[A-Za-z0-9_-]{20,}/.test(s)) {
          return null
        }
      } catch {}
      return event
    }
  })
  return Sentry
}

// Lazy accessor for hooks/components that want to report without importing
// Sentry directly.
export async function captureException(err, context) {
  if (!DSN) return
  try {
    const Sentry = await import('@sentry/react')
    Sentry.captureException(err, { extra: context })
  } catch {}
}

export function setUserContext(profile) {
  if (!DSN || !profile) return
  import('@sentry/react').then(Sentry => {
    Sentry.setUser({ email: profile.email, username: profile.name })
  }).catch(() => {})
}

export function clearUserContext() {
  if (!DSN) return
  import('@sentry/react').then(Sentry => {
    Sentry.setUser(null)
  }).catch(() => {})
}
