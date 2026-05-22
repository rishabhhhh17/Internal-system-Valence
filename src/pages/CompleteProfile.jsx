// CompleteProfile — one-shot welcome screen for users who got
// auto-claimed into the Valence team via their @valencegrowth.com email.
// They've already got a seat with their name from Google; we just need
// title and phone so the rest of the app can stop nagging.
//
// Two CTAs: Save & continue (calls complete_profile RPC with the
// values) and Skip for now (calls the RPC with no values — just stamps
// profile_completed_at so we never show this again).
//
// Lives at /complete-profile. App.jsx routes here when a signed-in
// user has a seat but profile_completed_at is null.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Check, User, ArrowRight, Sparkles } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.js'
import { useSeat } from '../hooks/useSeat.js'
import { useToast } from '../components/Toast.jsx'
import { humanError } from '../lib/userError.js'
import Logo from '../components/Logo.jsx'

export default function CompleteProfile() {
  const navigate = useNavigate()
  const toast = useToast()
  const { profile } = useAuth()
  const { seat, org, refresh } = useSeat()

  // Seed name from the seat (which the auto-claim pulled from Google
  // user_metadata). Title + phone start empty for the user to fill.
  const [fullName, setFullName] = useState('')
  const [title, setTitle]       = useState('')
  const [phone, setPhone]       = useState('')
  const [busy, setBusy]         = useState(false)

  useEffect(() => {
    if (seat) {
      setFullName(seat.full_name || profile?.name || '')
      setTitle(seat.title || '')
      setPhone(seat.phone || '')
    }
  }, [seat?.id])

  async function save({ skipped = false } = {}) {
    if (!isSupabaseConfigured) { toast.error('Supabase not configured.'); return }
    setBusy(true)
    try {
      const { error } = await supabase.rpc('complete_profile', skipped
        ? { p_full_name: null, p_title: null, p_phone: null }
        : { p_full_name: fullName, p_title: title, p_phone: phone }
      )
      if (error) throw error
      await refresh()
      if (!skipped) toast.success('Profile saved.')
      navigate('/', { replace: true })
    } catch (err) {
      toast.error(humanError(err, 'Could not save profile'))
    } finally {
      setBusy(false)
    }
  }

  const firstName = (fullName || profile?.name || '').split(' ')[0] || 'there'

  return (
    <div className="min-h-screen bg-valence-bg">
      <div className="relative mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-10">
        <header className="flex items-center justify-between">
          <Logo />
          {org?.name && (
            <span className="vl-eyebrow">{org.name}</span>
          )}
        </header>

        <main className="flex flex-1 items-center">
          <div className="w-full space-y-8">
            <div>
              <div className="rounded-full bg-valence-blue-soft p-2 text-valence-blue inline-flex">
                <Sparkles className="h-4 w-4" />
              </div>
              <h1 className="font-display text-3xl font-bold text-valence-text mt-4 leading-tight">
                Welcome, {firstName}.
              </h1>
              <p className="text-sm text-valence-muted mt-2 max-w-md">
                You're in the <span className="font-semibold text-valence-text">{org?.name || 'Valence Growth Partners'}</span> workspace.
                One quick thing — finish setting up your profile so the rest of the team knows who you are on shared mandates and notes.
              </p>
            </div>

            <div className="vl-card p-5 space-y-4">
              <Field icon={<User className="h-3 w-3" />} label="Full name">
                <input className="vl-input" value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Jane Doe" />
              </Field>
              <Field label="Title / role">
                <input className="vl-input" value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Managing Partner" autoFocus />
              </Field>
              <Field label="Phone (optional)">
                <input className="vl-input" value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+44 20 7946 0000" />
              </Field>
            </div>

            <div className="flex items-center justify-between">
              <button onClick={() => save({ skipped: true })}
                disabled={busy} className="vl-btn-ghost text-xs">
                Skip for now
              </button>
              <button onClick={() => save()}
                disabled={busy} className="vl-btn-primary">
                {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>
                      : <>Save & continue <ArrowRight className="h-4 w-4" /></>}
              </button>
            </div>

            <p className="text-[11px] text-valence-subtle">
              You can change any of this any time in Settings → Team.
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}

function Field({ icon, label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="vl-label inline-flex items-center gap-1.5">
        {icon} {label}
      </label>
      {children}
    </div>
  )
}
