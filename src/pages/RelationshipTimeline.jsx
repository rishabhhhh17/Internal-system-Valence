// /timeline/:valenceId/:externalId — Full interaction history for a
// (Valence person, external person) pair. Newest first.
//
// Pulls from interactions joined to both people rows. Email entries
// show subject only (we never store bodies). Meeting entries show
// title + duration if we have it.

import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Mail, MailOpen, Calendar, Phone, ArrowLeft } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import RelationshipChip, { humanDate } from '../components/RelationshipChip.jsx'

const ICONS = {
  email_sent:     { icon: Mail,     tone: 'text-slate-500' },
  email_received: { icon: MailOpen, tone: 'text-emerald-500' },
  meeting:        { icon: Calendar, tone: 'text-valence-blue' },
  call_logged:    { icon: Phone,    tone: 'text-amber-500' }
}

const LABEL = {
  email_sent:     'Email sent',
  email_received: 'Email received',
  meeting:        'Meeting',
  call_logged:    'Call'
}

export default function RelationshipTimeline() {
  const { valenceId, externalId } = useParams()
  const [valencePerson, setValencePerson]   = useState(null)
  const [externalPerson, setExternalPerson] = useState(null)
  const [rel, setRel] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!valenceId || !externalId || !isSupabaseConfigured) return
    let alive = true
    ;(async () => {
      setLoading(true); setError(null)
      try {
        const [vp, ep, rs, ints] = await Promise.all([
          supabase.from('people').select('id, full_name, role, company').eq('id', valenceId).maybeSingle(),
          supabase.from('people').select('id, full_name, role, company').eq('id', externalId).maybeSingle(),
          supabase.from('relationship_strength')
            .select('bucket, interaction_count, last_interaction_at')
            .eq('valence_person_id', valenceId)
            .eq('external_person_id', externalId)
            .maybeSingle(),
          supabase.from('interactions')
            .select('id, occurred_at, created_at, interaction_type, type, subject, summary, notes')
            .eq('valence_person_id', valenceId)
            .eq('external_person_id', externalId)
            .order('occurred_at', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false })
        ])
        if (!alive) return
        setValencePerson(vp.data || null)
        setExternalPerson(ep.data || null)
        setRel(rs.data || null)
        setItems(ints.data || [])
      } catch (e) {
        setError(e?.message || 'Could not load timeline')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [valenceId, externalId])

  if (loading) {
    return <div className="p-8 text-sm text-valence-muted">Loading timeline…</div>
  }
  if (error) {
    return <div className="p-8 text-sm text-valence-danger">{error}</div>
  }

  const monthsCovered = (() => {
    if (items.length < 2) return null
    const oldest = items[items.length - 1]
    const latest = items[0]
    const ot = new Date(oldest.occurred_at || oldest.created_at).getTime()
    const lt = new Date(latest.occurred_at || latest.created_at).getTime()
    const months = Math.round((lt - ot) / (30 * 86400000))
    return months > 0 ? months : null
  })()

  return (
    <div className="space-y-6">
      <Link to={-1} className="text-xs text-valence-muted hover:text-valence-text inline-flex items-center gap-1">
        <ArrowLeft className="h-3 w-3" /> Back
      </Link>

      <header>
        <p className="vl-eyebrow-ink">Relationship timeline</p>
        <h1 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-valence-text">
          {valencePerson?.full_name || '…'}{' '}
          <span className="text-valence-subtle font-normal">↔</span>{' '}
          {externalPerson?.full_name || '…'}
        </h1>
        <p className="mt-2 text-sm text-valence-muted">
          {items.length} interaction{items.length === 1 ? '' : 's'}
          {monthsCovered ? ` over ${monthsCovered} month${monthsCovered === 1 ? '' : 's'}` : ''}
          {rel && <> · Current bucket: <RelationshipChip bucket={rel.bucket} interactionCount={rel.interaction_count} lastInteractionAt={rel.last_interaction_at} /></>}
        </p>
      </header>

      {items.length === 0 ? (
        <div className="vl-card p-8 text-center text-sm text-valence-muted">
          No interactions logged between these two yet.
        </div>
      ) : (
        <ol className="vl-card p-6 space-y-5">
          {items.map((it, idx) => {
            const itype = it.interaction_type || it.type || 'email_sent'
            const { icon: Icon, tone } = ICONS[itype] || ICONS.email_sent
            const isLast = idx === items.length - 1
            return (
              <li key={it.id} className="relative flex gap-3">
                <div className="relative flex flex-col items-center">
                  <span className={`grid h-7 w-7 place-items-center rounded-full bg-valence-elevated border border-valence-border ${tone}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  {!isLast && (
                    <span className="absolute top-7 bottom-[-20px] w-px bg-valence-border" />
                  )}
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <p className="text-[11px] text-valence-muted">
                    {humanDate(it.occurred_at || it.created_at)}
                    <span className="text-valence-subtle"> · </span>
                    <span className="font-semibold text-valence-text">{LABEL[itype] || itype}</span>
                  </p>
                  {it.subject && (
                    <p className="mt-1 text-sm text-valence-text">{it.subject}</p>
                  )}
                  {(it.summary || it.notes) && (
                    <p className="mt-1 text-xs text-valence-muted leading-relaxed line-clamp-3">
                      {it.summary || it.notes}
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
