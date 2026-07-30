// StaleRelationships — dashboard card surfacing Warm + Strong contacts
// whose last interaction is >30 days old. The whole point of bucketing
// is to spot relationships about to slip before they go Cold.
//
// Mounts on /  (DailyNote page). Scoped to the viewer's own outgoing
// network — Aaditya doesn't see Manav's stale contacts.
//
// Each row: name + company, the bucket they're CURRENTLY in (so the user
// sees what they're about to lose), how long since last contact, an
// "Open in Gmail" button (uses the openGmailCompose helper — no Gmail
// API scope needed), and a deep-link to the timeline.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Snowflake, Mail, ArrowRight, ExternalLink } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { openGmailCompose } from '../lib/google.js'
import { useAuth } from '../hooks/useAuth.js'
import RelationshipChip, { humanDate } from './RelationshipChip.jsx'

const STALE_AFTER_DAYS = 30
const PREVIEW_COUNT = 5
const MAX_FETCH = 25

export default function StaleRelationships() {
  const { session } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured || !session?.user?.id) { setLoading(false); return }
    let alive = true
    ;(async () => {
      setLoading(true); setError(null)
      try {
        // Resolve the viewer's people row (the Valence team membership).
        // public.people has no user_id column — the bridge from auth user
        // to the team-member people row goes through seats.email →
        // people.email_normalised. The previous .eq('user_id', …) raised
        // 42703 on every Dashboard render and spammed the postgres log.
        // No row → user hasn't been added as a Valence team member yet,
        // render empty rather than crash.
        const { data: meSeat } = await supabase
          .from('seats')
          .select('email')
          .eq('user_id', session.user.id)
          .eq('active', true)
          .maybeSingle()
        const seatEmail = meSeat?.email ? String(meSeat.email).trim().toLowerCase() : null
        if (!alive) return
        if (!seatEmail) { setRows([]); setLoading(false); return }

        const { data: me } = await supabase
          .from('people')
          .select('id')
          .eq('email_normalised', seatEmail)
          .eq('is_valence_team', true)
          .maybeSingle()
        if (!alive) return
        if (!me?.id) { setRows([]); setLoading(false); return }

        const staleCutoff = new Date(Date.now() - STALE_AFTER_DAYS * 86400 * 1000).toISOString()

        const { data: rels, error: relErr } = await supabase
          .from('relationship_strength')
          .select('external_person_id, bucket, interaction_count, last_interaction_at')
          .eq('valence_person_id', me.id)
          .in('bucket', ['strong', 'warm'])
          .lt('last_interaction_at', staleCutoff)
          .order('last_interaction_at', { ascending: true })  // most stale first
          .limit(MAX_FETCH)
        if (relErr) throw relErr
        if (!alive) return

        if (!rels?.length) { setRows([]); setLoading(false); return }

        const ids = rels.map(r => r.external_person_id)
        const { data: people } = await supabase
          .from('people')
          .select('id, full_name, company, role, email')
          .in('id', ids)
        const nameMap = new Map((people || []).map(p => [p.id, p]))

        const merged = rels.map(r => ({
          ...r,
          person: nameMap.get(r.external_person_id) || { id: r.external_person_id, full_name: 'Unknown' }
        }))
        setRows(merged)
      } catch (e) {
        setError(e?.message || 'Could not load stale relationships')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [session?.user?.id])

  function reachOut(person) {
    if (!person?.email) return
    openGmailCompose({
      to: person.email,
      subject: `Catching up`,
      body: `Hi ${(person.full_name || '').split(' ')[0] || 'there'},\n\nIt's been a while — wanted to reach out and see how things are going on your end.\n\nLet me know if you have time for a quick call this week or next.\n\nBest,`
    })
  }

  // Card chrome — matches the other dashboard cards (Card helper in
  // DailyNote uses vl-card + vl-eyebrow-ink). Re-creating the shell
  // inline so this component can be dropped anywhere, not just inside
  // DailyNote's grid.
  return (
    <section className="vl-card p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="vl-eyebrow-ink inline-flex items-center gap-1.5">
            <Snowflake className="h-3 w-3" /> Cooling relationships
          </p>
          <p className="mt-0.5 text-[11px] text-valence-muted">
            Warm + Strong contacts you haven't touched in {STALE_AFTER_DAYS}+ days. Reach out before they slip to Cold.
          </p>
        </div>
        {rows.length > 0 && (
          <span className="inline-flex items-center justify-center rounded-full bg-valence-warning/15 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-valence-warning shrink-0">
            {rows.length}
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-10 w-full rounded bg-valence-surface" />
          <div className="h-10 w-full rounded bg-valence-surface" />
        </div>
      ) : error ? (
        <p className="text-xs text-valence-danger">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-valence-muted">
          Nothing slipping. Every warm or strong relationship has had a touch in the last {STALE_AFTER_DAYS} days.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-valence-border/60">
            {(expanded ? rows : rows.slice(0, PREVIEW_COUNT)).map(r => (
              <li key={r.external_person_id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link to={`/people?open=${r.external_person_id}`} className="text-sm font-semibold text-valence-text hover:text-valence-blue truncate">
                      {r.person.full_name}
                    </Link>
                    <RelationshipChip bucket={r.bucket} interactionCount={r.interaction_count} lastInteractionAt={r.last_interaction_at} />
                  </div>
                  <p className="mt-0.5 text-[11px] text-valence-muted truncate">
                    {r.person.company && <>{r.person.company}<span className="text-valence-subtle"> · </span></>}
                    last touch {humanDate(r.last_interaction_at)}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {r.person.email && (
                    <button
                      onClick={() => reachOut(r.person)}
                      className="inline-flex items-center gap-1 rounded-full border border-valence-blue/30 bg-valence-blue-soft px-2 py-1 text-[11px] font-semibold text-valence-blue hover:bg-valence-blue/20 transition"
                      title={`Open Gmail draft to ${r.person.email}`}
                    >
                      <Mail className="h-3 w-3" /> Reach out
                    </button>
                  )}
                  <Link
                    to={`/people?open=${r.external_person_id}`}
                    className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-valence-muted hover:text-valence-blue px-1"
                    title="Open profile"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>

          {rows.length > PREVIEW_COUNT && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-valence-blue hover:text-valence-blue-hover"
            >
              {expanded
                ? <>Show top {PREVIEW_COUNT}</>
                : <>Show all {rows.length} <ArrowRight className="h-3 w-3" /></>}
            </button>
          )}
        </>
      )}
    </section>
  )
}
