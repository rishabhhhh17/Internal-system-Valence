import { useState } from 'react'
import { Calendar, FolderOpen, Mail, Check, RefreshCw, LogOut, ShieldAlert } from 'lucide-react'
import { signInWithGoogle, signOut } from '../lib/google.js'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from './Toast.jsx'
import { humanError } from '../lib/userError.js'
import { isSupabaseConfigured } from '../lib/supabase.js'

// Settings → Integrations panel. Replaces the per-scope detail that used
// to live inside the topbar GoogleButton dropdown — the dropdown stays as
// a quick account indicator, but the granular Calendar / Drive / Gmail
// connection state and reconnect controls live here.
export default function GoogleWorkspacePanel() {
  const { profile, googleConnected, provider } = useAuth()
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  if (!isSupabaseConfigured) {
    return (
      <div className="vl-card p-6 text-sm text-valence-muted">
        <div className="font-semibold text-valence-text mb-1">Google Workspace</div>
        <p>Supabase is not configured for this build, so Google sign-in is disabled.</p>
      </div>
    )
  }

  async function connect() {
    setBusy(true)
    try { await signInWithGoogle() }
    catch (e) { toast.error(humanError(e, 'Could not start Google sign-in')); setBusy(false) }
  }

  async function disconnect() {
    setBusy(true)
    try { await signOut(); toast.success('Signed out.') }
    catch (e) { toast.error(humanError(e, 'Could not sign out')) }
    finally { setBusy(false) }
  }

  const signedIn = Boolean(profile)
  const needsReconnect = signedIn && provider === 'google' && !googleConnected

  return (
    <div className="vl-card p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-valence-blue-soft p-2 text-valence-blue">
          <GoogleGlyph className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-valence-text">Google Workspace</h3>
          <p className="text-xs text-valence-muted mt-0.5">
            Calendar, Drive, and Gmail access for the meeting suggester, file picker, and follow-up sender.
          </p>
        </div>
        {signedIn && (
          <span className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            googleConnected
              ? 'bg-valence-blue-soft text-valence-blue-deep'
              : 'bg-amber-50 text-amber-800'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${googleConnected ? 'bg-valence-success' : 'bg-amber-500'}`} />
            {googleConnected ? 'Connected' : 'Reauth needed'}
          </span>
        )}
      </div>

      {!signedIn ? (
        <div className="rounded-lg border border-valence-border bg-valence-surface px-4 py-4 space-y-3">
          <p className="text-xs text-valence-muted">
            Sign in with the Google account that owns your calendar and drive. Scopes requested at sign-in.
          </p>
          <button onClick={connect} disabled={busy} className="vl-btn-secondary-sm">
            <GoogleGlyph className="h-3.5 w-3.5" />
            {busy ? 'Connecting…' : 'Connect Google'}
          </button>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-valence-border bg-valence-surface px-4 py-3 flex items-center gap-3">
            <Avatar profile={profile} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-valence-text">{profile.name}</p>
              <p className="truncate text-[11px] text-valence-muted">{profile.email}</p>
            </div>
          </div>

          <div className="space-y-1">
            <div className="vl-eyebrow-ink">Scopes</div>
            <ScopeRow icon={Calendar}   label="Calendar"   ok={googleConnected} />
            <ScopeRow icon={FolderOpen} label="Drive"      ok={googleConnected} />
            <ScopeRow icon={Mail}       label="Gmail send" ok={googleConnected} />
          </div>

          {needsReconnect && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-start gap-2 text-[12px] text-amber-900">
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
              <p>The Google session for these scopes has expired. Reconnect to restore Calendar / Drive / Gmail access.</p>
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button onClick={connect} disabled={busy} className="vl-btn-secondary-sm">
              <RefreshCw className="h-3.5 w-3.5" />
              {needsReconnect ? 'Reconnect' : 'Refresh scopes'}
            </button>
            <button onClick={disconnect} disabled={busy} className="vl-btn-ghost text-valence-muted hover:text-valence-danger">
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function ScopeRow({ icon: Icon, label, ok }) {
  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs">
      <Icon className="h-3.5 w-3.5 text-valence-muted" />
      <span className="flex-1 text-valence-text">{label}</span>
      {ok
        ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-valence-success"><Check className="h-3 w-3" /> Connected</span>
        : <span className="text-[10px] font-semibold text-amber-700">Reauth needed</span>}
    </div>
  )
}

function Avatar({ profile }) {
  if (profile?.avatar) {
    return <img src={profile.avatar} alt={profile.name} className="h-9 w-9 rounded-full object-cover ring-1 ring-valence-border-strong" referrerPolicy="no-referrer" />
  }
  const initials = (profile?.name || profile?.email || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-valence-blue to-[#1a66cc] grid place-items-center text-xs font-semibold text-white ring-1 ring-valence-border-strong">
      {initials}
    </div>
  )
}

function GoogleGlyph({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.28-.97 2.36-2.06 3.08v2.56h3.33c1.95-1.79 3.07-4.43 3.07-7.58 0-.74-.07-1.44-.19-2.11H12z"/>
      <path fill="#34A853" d="M12 21.5c2.76 0 5.07-.91 6.76-2.46l-3.33-2.56c-.92.62-2.1.99-3.43.99-2.64 0-4.88-1.78-5.68-4.18H2.86v2.63C4.54 19.09 7.99 21.5 12 21.5z"/>
      <path fill="#FBBC05" d="M6.32 13.29c-.2-.6-.32-1.24-.32-1.9s.11-1.3.32-1.9V6.86H2.86C2.31 7.94 2 9.17 2 10.5s.31 2.56.86 3.64l3.46-2.65z"/>
      <path fill="#4285F4" d="M12 5.5c1.5 0 2.85.52 3.91 1.54l2.94-2.94C17.07 2.39 14.76 1.5 12 1.5 7.99 1.5 4.54 3.91 2.86 6.86l3.46 2.63C7.12 7.28 9.36 5.5 12 5.5z"/>
    </svg>
  )
}
