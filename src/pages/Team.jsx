// Team — list every seated member of the signed-in user's firm.
// Source of truth is public.seats (RLS scopes to current_user_org_id()
// automatically, so we don't have to filter client-side).
//
// History: this page used to render an 8-person hardcoded TEAM array
// (Neha Jain / Rishi Kapoor / etc) as if they were the firm's actual
// roster. That was demo decoration from when the product had no auth
// — a tenant creating "Pinnacle Capital" would still see "Neha Jain
// of Valence Growth Partners" on their Team page, which made every
// new firm look like a fork of VGP. This rewrite reads the seats
// table so each tenant sees their own teammates only.

import { useEffect, useMemo, useState } from 'react'
import { Search, MapPin, Mail, ArrowUpRight, Users } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.js'
import { useSeat } from '../hooks/useSeat.js'
import EmptyState from '../components/EmptyState.jsx'

const ROLE_ORDER = ['admin', 'partner', 'analyst', 'observer']

function roleLabel(r) {
  if (!r) return ''
  return r.charAt(0).toUpperCase() + r.slice(1)
}

function initials(name) {
  return (name || '?')
    .split(/\s+/).filter(Boolean)
    .map(n => n[0]).slice(0, 2).join('').toUpperCase()
}

export default function Team() {
  const { profile } = useAuth()
  const { org } = useSeat()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')
  const [roleFilter, setRoleFilter] = useState('All')

  // Fetch every active seat in the user's org. RLS already filters to
  // the current tenant, so we don't need an org_id .eq() — but we add
  // .eq('active', true) so a deactivated seat doesn't render.
  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return }
    let alive = true
    ;(async () => {
      setLoading(true); setError(null)
      const { data, error: err } = await supabase
        .from('seats')
        .select('id, user_id, email, full_name, title, phone, role, added_at, billable_from')
        .eq('active', true)
        .order('added_at', { ascending: true })
      if (!alive) return
      if (err) setError(err.message)
      else setMembers(data || [])
      setLoading(false)
    })()
    return () => { alive = false }
  }, [org?.id])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return members
      .filter(m =>
        (roleFilter === 'All' || (m.role || '').toLowerCase() === roleFilter.toLowerCase()) &&
        (!needle ||
          (m.full_name || '').toLowerCase().includes(needle) ||
          (m.title || '').toLowerCase().includes(needle) ||
          (m.email || '').toLowerCase().includes(needle))
      )
      .sort((a, b) => {
        // Admins first, then by order in ROLE_ORDER, then by added_at
        const ra = ROLE_ORDER.indexOf((a.role || '').toLowerCase())
        const rb = ROLE_ORDER.indexOf((b.role || '').toLowerCase())
        return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb)
      })
  }, [members, q, roleFilter])

  const roleOptions = useMemo(() => {
    const present = new Set(members.map(m => (m.role || '').toLowerCase()).filter(Boolean))
    return ROLE_ORDER.filter(r => present.has(r)).map(r => roleLabel(r))
  }, [members])

  const headerCount = members.length

  return (
    <div className="space-y-6">
      {/* Header — quiet, IB-grade. No marketing hero. */}
      <div>
        <p className="vl-eyebrow-ink">Team</p>
        <h1 className="mt-2 font-display text-feature font-bold text-valence-text">
          {org?.name ? `Everyone at ${org.name}` : 'Your team'}
        </h1>
        <p className="mt-2 text-sm text-valence-muted">
          {headerCount === 0
            ? 'You\'re the first one here. Invite the rest of your firm from Settings → Team.'
            : headerCount === 1
              ? 'Just you for now. Invite the rest of your firm from Settings → Team.'
              : `${headerCount} active seat${headerCount === 1 ? '' : 's'} in your firm.`}
        </p>
      </div>

      {/* Filters — role filter intentionally hidden along with the role
          labels; firm treats everyone as equal members. Just a search box. */}
      {headerCount > 0 && (
        <div className="vl-card p-3">
          <div className="flex flex-1 min-w-[240px] items-center gap-2 rounded-lg border border-valence-border bg-valence-surface px-3 py-2">
            <Search className="h-3.5 w-3.5 text-valence-subtle" />
            <input
              value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search by name, title or email…"
              className="flex-1 bg-transparent text-sm text-valence-text placeholder:text-valence-subtle outline-none"
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="vl-card p-10 text-center text-sm text-valence-muted">Loading the team…</div>
      ) : error ? (
        <EmptyState icon={Users} title="Couldn't load the team" description={error} />
      ) : members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="You're the only one here yet"
          description="Generate an invite code in Settings → Team to bring teammates into this workspace."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map(m => (
            <PersonCard
              key={m.id}
              person={m}
              isYou={m.user_id === profile?.id}
            />
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && members.length > 0 && (
        <div className="vl-card py-10 text-center text-sm text-valence-muted">
          No one matches those filters.
        </div>
      )}
    </div>
  )
}

function PersonCard({ person, isYou }) {
  const name = person.full_name || person.email || 'Unnamed'
  return (
    <article className="vl-card vl-card-hover relative p-4">
      <div className="flex items-start gap-3">
        <Avatar name={name} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-[14px] font-semibold text-valence-text">{name}</p>
            {isYou && (
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-valence-blue bg-valence-blue-soft border border-valence-blue/30 rounded-full px-1.5 py-0.5">
                You
              </span>
            )}
          </div>
          {/* Display the user-typed job title (Managing Partner / Analyst /
              Intern / whatever they wrote). The technical seat role
              (admin / partner / analyst / observer) used to render here
              as a secondary line — pulled it because the firm treats
              everyone as equal members, with the title field being the
              only differentiator. The technical role still gates server-
              side actions (e.g. create_invite requires admin) but isn't
              surfaced as a status label in the UI. */}
          {person.title && (
            <p className="mt-0.5 text-xs text-valence-muted truncate">{person.title}</p>
          )}
        </div>
      </div>

      {person.email && (
        <div className="mt-3 border-t border-valence-border/60 pt-3">
          <a
            href={`mailto:${person.email}`}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-valence-muted hover:text-valence-blue truncate"
          >
            <Mail className="h-3 w-3 shrink-0" /> <span className="truncate">{person.email}</span>
          </a>
        </div>
      )}
    </article>
  )
}

function Avatar({ name }) {
  // Deterministic blue-family gradient per person — same recipe as before
  // but applied per real-seat name.
  const seed = (name || '?').charCodeAt(0) + (name || '?').charCodeAt(Math.max(0, (name || '?').length - 1))
  const hue = 210 + (seed % 20)
  const style = {
    background: `linear-gradient(135deg, hsl(${hue} 100% 60%) 0%, hsl(${hue} 90% 45%) 100%)`
  }
  return (
    <div
      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-semibold text-white ring-1 ring-valence-border-strong shadow-valence"
      style={style}
    >
      {initials(name)}
    </div>
  )
}

function Select({ value, onChange, label, options }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-valence-border bg-valence-surface pl-3 pr-2 py-2 text-xs font-medium text-valence-muted">
      <span className="text-[11px] uppercase tracking-wider">{label}</span>
      <select
        value={value} onChange={e => onChange(e.target.value)}
        className="bg-transparent pr-1 text-sm font-semibold text-valence-text outline-none"
      >
        {options.map(o => <option key={o} className="bg-valence-surface" value={o}>{o}</option>)}
      </select>
    </label>
  )
}
