import { useEffect, useRef, useState } from 'react'
import { LogOut, RefreshCw, Check, Mail, Calendar, FolderOpen } from 'lucide-react'
import { signInWithGoogle, signOut } from '../lib/google.js'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from './Toast.jsx'

export default function GoogleButton() {
  const { profile, googleConnected, provider } = useAuth()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const menuRef = useRef(null)
  const toast = useToast()

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (!menuRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function connect() {
    setBusy(true)
    try {
      await signInWithGoogle()
    } catch (e) {
      toast.error(e.message || 'Could not start Google sign-in')
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    try { await signOut(); toast.success('Signed out.') }
    catch (e) { toast.error(e.message) }
    finally { setBusy(false); setOpen(false) }
  }

  // Not signed in — show "Connect Google"
  if (!profile) {
    return (
      <button onClick={connect} disabled={busy} className="vl-btn-secondary whitespace-nowrap">
        <GoogleGlyph className="h-4 w-4" />
        <span className="hidden sm:inline">{busy ? 'Connecting…' : 'Connect Google'}</span>
      </button>
    )
  }

  // Signed in — show avatar + menu
  const needsReconnect = provider === 'google' && !googleConnected
  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="group flex items-center gap-2 rounded-full border border-valence-border bg-valence-surface p-0.5 pr-3 transition hover:border-valence-border-strong"
      >
        <Avatar profile={profile} />
        <span className="hidden md:inline text-xs font-semibold text-valence-text max-w-[140px] truncate">{profile.name}</span>
        {googleConnected
          ? <span className="h-1.5 w-1.5 rounded-full bg-valence-success shadow-[0_0_6px_#34d399]" title="Google connected" />
          : <span className="h-1.5 w-1.5 rounded-full bg-valence-warning" title="Google session expired" />
        }
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-72 animate-slide-up rounded-xl border border-valence-border-strong bg-valence-surface shadow-valence">
          <div className="flex items-center gap-3 border-b border-valence-border px-4 py-3.5">
            <Avatar profile={profile} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-valence-text">{profile.name}</p>
              <p className="truncate text-[11px] text-valence-muted">{profile.email}</p>
            </div>
          </div>

          <div className="px-2 py-2">
            <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-valence-subtle">
              Google access
            </div>
            <Row icon={Calendar}   label="Calendar"    ok={googleConnected} />
            <Row icon={FolderOpen} label="Drive"       ok={googleConnected} />
            <Row icon={Mail}       label="Gmail send"  ok={googleConnected} />
          </div>

          <div className="border-t border-valence-border px-2 py-2 space-y-1">
            {needsReconnect && (
              <button onClick={connect} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-valence-warning hover:bg-valence-surface">
                <RefreshCw className="h-3.5 w-3.5" /> Reconnect Google
              </button>
            )}
            {!needsReconnect && googleConnected && (
              <button onClick={connect} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-valence-muted hover:bg-valence-surface hover:text-valence-text">
                <RefreshCw className="h-3.5 w-3.5" /> Refresh Google scopes
              </button>
            )}
            <button onClick={disconnect} disabled={busy} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-valence-muted hover:bg-valence-surface hover:text-valence-danger">
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ icon: Icon, label, ok }) {
  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs">
      <Icon className="h-3.5 w-3.5 text-valence-muted" />
      <span className="flex-1 text-valence-text">{label}</span>
      {ok
        ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-valence-success"><Check className="h-3 w-3" /> Connected</span>
        : <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-valence-warning">Reauth needed</span>}
    </div>
  )
}

function Avatar({ profile, size = 'md' }) {
  const dim = size === 'lg' ? 'h-10 w-10 text-sm' : 'h-8 w-8 text-xs'
  if (profile.avatar) {
    return <img src={profile.avatar} alt={profile.name} className={`${dim} rounded-full object-cover ring-1 ring-valence-border-strong`} referrerPolicy="no-referrer" />
  }
  const initials = (profile.name || profile.email || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div className={`${dim} rounded-full bg-gradient-to-br from-valence-blue to-[#1a66cc] grid place-items-center font-semibold text-white ring-1 ring-valence-border-strong`}>
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
