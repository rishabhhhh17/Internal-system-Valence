// ValenceConnectionsPanel — for an external person's profile.
//
// Shows every Valence team member who has interacted with this person,
// with bucket chips + interaction count + last contact. Below that, a
// "Best Intro Path" callout when the viewer doesn't have a Strong
// relationship themselves.
//
// Empty state: "No one at Valence has interacted with this person yet"
// + a link to the manual interaction logger.
//
// Data sources:
//   - public.relationship_strength (joined with people for valence
//     team member names)
//   - public.people (the target external person and the Valence
//     contacts)

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Clock, MessageSquarePlus, ArrowRight, Sparkles } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { useSeat } from '../hooks/useSeat.js'
import RelationshipChip, { humanDate } from './RelationshipChip.jsx'

const BUCKET_ORDER = ['strong', 'warm', 'cool', 'cold']

export default function ValenceConnectionsPanel({ externalPersonId }) {
  const { seat } = useSeat()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!externalPersonId || !isSupabaseConfigured) { setLoading(false); return }
    let alive = true
    ;(async () => {
      setLoading(true); setError(null)
      try {
        // Pull all relationship rows for this external person, then
        // fetch valence person names in a second round-trip. Two reads
        // but both indexed and tiny.
        const { data: rels, error: err } = await supabase
          .from('relationship_strength')
          .select('valence_person_id, bucket, interaction_count, last_interaction_at')
          .eq('external_person_id', externalPersonId)
        if (err) throw err
        if (!alive) return
        const valenceIds = (rels || []).map(r => r.valence_person_id)
        let nameMap = new Map()
        if (valenceIds.length > 0) {
          const { data: ps } = await supabase
            .from('people').select('id, full_name, role').in('id', valenceIds)
          nameMap = new Map((ps || []).map(p => [p.id, p]))
        }
        const enriched = (rels || []).map(r => ({
          valence_person_id: r.valence_person_id,
          valence_person_name: nameMap.get(r.valence_person_id)?.full_name || 'Unknown',
          valence_person_role: nameMap.get(r.valence_person_id)?.role || null,
          bucket: r.bucket,
          interaction_count: r.interaction_count,
          last_interaction_at: r.last_interaction_at
        }))
        // Sort by bucket strength, then by recency within bucket.
        enriched.sort((a, b) => {
          const ai = BUCKET_ORDER.indexOf(a.bucket)
          const bi = BUCKET_ORDER.indexOf(b.bucket)
          if (ai !== bi) return ai - bi
          return new Date(b.last_interaction_at || 0) - new Date(a.last_interaction_at || 0)
        })
        setRows(enriched)
      } catch (e) {
        setError(e?.message || 'Could not load Valence connections')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [externalPersonId])

  if (loading) {
    return (
      <section className="vl-card p-5 space-y-2">
        <p className="vl-eyebrow-ink">Valence Connections</p>
        <div className="h-6 w-32 rounded bg-valence-surface animate-pulse" />
        <div className="h-12 w-full rounded bg-valence-surface animate-pulse" />
      </section>
    )
  }

  if (error) {
    return (
      <section className="vl-card p-5">
        <p className="vl-eyebrow-ink">Valence Connections</p>
        <p className="mt-2 text-xs text-valence-danger">{error}</p>
      </section>
    )
  }

  if (rows.length === 0) {
    return (
      <section className="vl-card p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-valence-blue-soft p-2 text-valence-blue">
            <Users className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <p className="vl-eyebrow-ink">Valence Connections</p>
            <p className="mt-1 text-sm text-valence-text">No one at Valence has interacted with this person yet.</p>
            <Link to={`/interactions?new=1&counterparty=${encodeURIComponent(externalPersonId)}`}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-valence-blue hover:text-valence-blue-hover">
              <MessageSquarePlus className="h-3 w-3" /> Log a first interaction
            </Link>
          </div>
        </div>
      </section>
    )
  }

  const viewerSeatId = seat?.id
  const viewerHasStrong = rows.find(r => r.valence_person_id === viewerSeatId)?.bucket === 'strong'
  const bestPath = rows[0]  // already sorted, highest bucket + most recent wins

  return (
    <section className="space-y-3">
      <div className="vl-card p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-valence-blue-soft p-2 text-valence-blue">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <p className="vl-eyebrow-ink">Valence Connections</p>
              <p className="text-xs text-valence-muted mt-0.5">
                {rows.length} team member{rows.length === 1 ? ' has' : 's have'} interacted with this person
              </p>
            </div>
          </div>
        </div>

        <ul className="mt-4 divide-y divide-valence-border/60">
          {rows.map(r => (
            <li key={r.valence_person_id} className="py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Link
                  to={`/people?open=${r.valence_person_id}`}
                  className="text-sm font-semibold text-valence-text hover:text-valence-blue truncate block"
                >
                  {r.valence_person_name}
                </Link>
                {r.valence_person_role && (
                  <p className="text-[11px] text-valence-muted">{r.valence_person_role}</p>
                )}
                <p className="mt-1 text-[11px] text-valence-muted inline-flex items-center gap-2">
                  <span>{r.interaction_count} interaction{r.interaction_count === 1 ? '' : 's'}</span>
                  {r.last_interaction_at && (
                    <>
                      <span className="text-valence-subtle">·</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Last contact {humanDate(r.last_interaction_at)}
                      </span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <RelationshipChip
                  bucket={r.bucket}
                  interactionCount={r.interaction_count}
                  lastInteractionAt={r.last_interaction_at}
                />
                <Link
                  to={`/timeline/${r.valence_person_id}/${externalPersonId}`}
                  className="text-[11px] font-semibold text-valence-blue hover:text-valence-blue-hover inline-flex items-center gap-0.5"
                >
                  Timeline <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {!viewerHasStrong && bestPath && bestPath.bucket !== 'cold' && (
        <div className="rounded-xl border border-valence-blue/30 bg-valence-blue-soft/40 p-4">
          <div className="flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-valence-blue mt-0.5" />
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-valence-blue-deep">
                BEST INTRO PATH
              </p>
              <p className="mt-1 text-sm text-valence-text">
                <Link to={`/people?open=${bestPath.valence_person_id}`} className="font-semibold hover:text-valence-blue">
                  {bestPath.valence_person_name}
                </Link>{' '}
                has the {bestPath.bucket} relationship here.
                Consider asking for an introduction.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
