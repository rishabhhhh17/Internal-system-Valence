// CompleteProfile — one-shot welcome for users auto-claimed into a firm
// via their work-domain email. Seat + name already exist; we collect
// title + phone. Save or Skip both stamp profile_completed_at so this
// never shows again. App.jsx routes here when seat exists but
// profile_completed_at is null.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, User, ArrowRight, Sparkles } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.js'
import { useSeat } from '../hooks/useSeat.js'
import { useToast } from '../components/Toast.jsx'
import { humanError } from '../lib/userError.js'
import OnboardingShell from '../components/OnboardingShell.jsx'

export default function CompleteProfile() {
  const navigate = useNavigate()
  const toast = useToast()
  const { profile } = useAuth()
  const { seat, org, refresh } = useSeat()

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
        : { p_full_name: fullName, p_title: title, p_phone: phone })
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
  const right = org?.name ? <span className="vl-eyebrow text-valence-muted">{org.name}</span> : null

  return (
    <OnboardingShell right={right} maxWidth="max-w-lg">
      <div className="space-y-7">
        <header className="text-center">
          <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-valence-blue-soft text-valence-blue-deep">
            <Sparkles className="h-5 w-5" />
          </div>
          <h1 className="mt-4 font-display text-3xl font-bold leading-tight text-valence-text">
            Welcome, {firstName}
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-valence-muted">
            You're in the <span className="font-semibold text-valence-text">{org?.name || 'Valence Growth Partners'}</span> workspace.
            One quick thing — finish your profile so teammates know who you are on shared mandates.
          </p>
        </header>

        <div className="vl-card p-5 space-y-4">
          <Field icon={<User className="h-3 w-3" />} label="Full name">
            <input className="vl-input" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Doe" />
          </Field>
          <Field label="Title / role">
            <input className="vl-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Managing Partner" autoFocus />
          </Field>
          <Field label="Phone (optional)">
            <input className="vl-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+44 20 7946 0000" />
          </Field>
        </div>

        <div className="flex items-center justify-between">
          <button onClick={() => save({ skipped: true })} disabled={busy} className="vl-btn-ghost text-xs">
            Skip for now
          </button>
          <button onClick={() => save()} disabled={busy} className="vl-btn-primary">
            {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : <>Save & continue <ArrowRight className="h-4 w-4" /></>}
          </button>
        </div>

        <p className="text-center text-[11px] text-valence-subtle">Change any of this any time in Settings → Team.</p>
      </div>
    </OnboardingShell>
  )
}

function Field({ icon, label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="vl-label inline-flex items-center gap-1.5">{icon} {label}</label>
      {children}
    </div>
  )
}
