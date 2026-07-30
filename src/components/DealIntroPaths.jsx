// DealIntroPaths — "Who at Valence can introduce us here?"
//
// Lives inside the deal drawer as the Intros tab. Ranks Valence team
// members by their best relationship to anyone connected to the deal —
// where "connected" = either an interaction logged on this deal, or
// (fallback) a person whose company matches the deal's client_name.
//
// Wraps the data that the AI's find_best_intro_path tool uses, but
// presented directly so users don't have to ask the chat.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, ArrowRight, Users } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import RelationshipChip, { humanDate } from './RelationshipChip.jsx'

const BUCKET_RANK = { strong: 0, warm: 1, cool: 2, cold: 3 }

export default function DealIntroPaths({ deal }) {
  const [paths, setPaths] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [source, setSource] = useState(null)   // 'interactions' | 'company_match' | null

  useEffect(() => {
    if (!deal?.id || !isSupabaseConfigured) { setLoading(false); return }
    let alive = true
    ;(async () => {
      setLoading(true); setError(null)
      try {
        // Step 1: external people connected to this deal via interactions.
        const { data: linked } = await supabase.from('interactions')
          .select('external_person_id')
          .eq('deal_id', deal.id)
          .not('external_person_id', 'is', null)
        const idsFromInteractions = Array.from(
          new Set((linked || []).map(r => r.external_person_id).filter(Boolean))
        )

        // Step 2: fallback to company-name match if no interactions linked.
        let externalIds = idsFromInteractions
        let usedSource = idsFromInteractions.length ? 'interactions' : null
        if (externalIds.length === 0 && deal.client_name) {
          const needle = deal.client_name.trim()
          if (needle) {
            const { data: byCompany } = await supabase.from('people')
              .select('id')
              .eq('is_valence_team', false)
              .ilike('company', `%${needle}%`)
              .limit(20)
            externalIds = (byCompany || []).map(p => p.id)
            usedSource = externalIds.length ? 'company_match' : null
          }
        }
        if (!alive) return
        setSource(usedSource)

        if (externalIds.length === 0) {
          setPaths([]); setLoading(false); return
        }

        // Step 3: pull relationship_strength rows for those targets.
        const { data: rels, error: relErr } = await supabase.from('relationship_strength')
          .select('valence_person_id, external_person_id, bucket, interaction_count, last_interaction_at')
          .in('external_person_id', externalIds)
        if (relErr) throw relErr

        if (!alive) return
        if (!rels?.length) { setPaths([]); setLoading(false); return }

        // Resolve names for both valence and external people in one round-trip.
        const allPeopleIds = Array.from(new Set([
          ...rels.map(r => r.valence_person_id),
          ...rels.map(r => r.external_person_id)
        ]))
        const { data: peopleRows } = await supabase.from('people')
          .select('id, full_name, role, company')
          .in('id', allPeopleIds)
        const nameMap = new Map((peopleRows || []).map(p => [p.id, p]))

        // Step 4: pick the BEST relationship per Valence person (so each
        // person appears once). Then rank Valence people by bucket strength
        // and interaction count.
        const bestPerValence = new Map()
        for (const r of rels) {
          const cur = bestPerValence.get(r.valence_person_id)
          if (!cur || isStronger(r, cur)) {
            bestPerValence.set(r.valence_person_id, r)
          }
        }

        const ranked = Array.from(bestPerValence.values())
          .map(r => ({
            valence: nameMap.get(r.valence_person_id) || { id: r.valence_person_id, full_name: 'Unknown' },
            external: nameMap.get(r.external_person_id) || { id: r.external_person_id, full_name: 'Unknown' },
            bucket: r.bucket,
            interaction_count: r.interaction_count,
            last_interaction_at: r.last_interaction_at
          }))
          .sort((a, b) => {
            const rd = (BUCKET_RANK[a.bucket] ?? 9) - (BUCKET_RANK[b.bucket] ?? 9)
            if (rd !== 0) return rd
            return (b.interaction_count || 0) - (a.interaction_count || 0)
          })
          .slice(0, 5)

        setPaths(ranked)
      } catch (e) {
        setError(e?.message || 'Could not load intro paths')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [deal?.id, deal?.client_name])

  if (loading) {
    return (
      <section className="vl-card p-5 space-y-2">
        <p className="vl-eyebrow-ink">Best intro paths</p>
        <div className="h-6 w-32 rounded bg-valence-surface animate-pulse" />
        <div className="h-12 w-full rounded bg-valence-surface animate-pulse" />
      </section>
    )
  }

  if (error) {
    return (
      <section className="vl-card p-5">
        <p className="vl-eyebrow-ink">Best intro paths</p>
        <p className="mt-2 text-xs text-valence-danger">{error}</p>
      </section>
    )
  }

  if (paths.length === 0) {
    return (
      <section className="vl-card p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-valence-blue-soft p-2 text-valence-blue">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <p className="vl-eyebrow-ink">Best intro paths</p>
            <p className="mt-1 text-sm text-valence-text">
              No one at Valence has a logged relationship with anyone connected to{' '}
              <span className="font-semibold">{deal?.client_name || 'this deal'}</span>.
            </p>
            <p className="mt-2 text-[11px] text-valence-muted">
              {deal?.client_name
                ? `Try adding counterparties under the Counterparties tab, or logging an interaction on this deal.`
                : 'Set the deal\'s client to see intro paths.'}
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="vl-card p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-valence-blue-soft p-2 text-valence-blue">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <p className="vl-eyebrow-ink">Best intro paths</p>
            <p className="mt-0.5 text-[11px] text-valence-muted">
              {source === 'interactions'
                ? `Ranked from ${paths.length} Valence team member${paths.length === 1 ? '' : 's'} with logged relationships on this deal.`
                : `Ranked from company-name match on "${deal?.client_name}".`}
            </p>
          </div>
        </div>
      </div>

      <ol className="mt-4 divide-y divide-valence-border/60">
        {paths.map((p, i) => (
          <li key={p.valence.id} className="py-3 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-valence-elevated border border-valence-border text-[10px] font-bold text-valence-muted">
                  {i + 1}
                </span>
                <Link to={`/people?open=${p.valence.id}`} className="text-sm font-semibold text-valence-text hover:text-valence-blue truncate">
                  {p.valence.full_name}
                </Link>
                {p.valence.role && (
                  <span className="text-[11px] text-valence-muted">· {p.valence.role}</span>
                )}
              </div>
              <p className="mt-1 ml-8 text-[11px] text-valence-muted truncate">
                via{' '}
                <Link to={`/people?open=${p.external.id}`} className="text-valence-text hover:text-valence-blue">
                  {p.external.full_name}
                </Link>
                {p.external.company && <span className="text-valence-subtle"> at {p.external.company}</span>}
                <span className="text-valence-subtle"> · {p.interaction_count} interaction{p.interaction_count === 1 ? '' : 's'}</span>
                {p.last_interaction_at && <span className="text-valence-subtle"> · last {humanDate(p.last_interaction_at)}</span>}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <RelationshipChip
                bucket={p.bucket}
                interactionCount={p.interaction_count}
                lastInteractionAt={p.last_interaction_at}
              />
              <Link
                to={`/timeline/${p.valence.id}/${p.external.id}`}
                className="text-[11px] font-semibold text-valence-blue hover:text-valence-blue-hover inline-flex items-center gap-0.5"
              >
                Timeline <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

function isStronger(a, b) {
  const ar = BUCKET_RANK[a.bucket] ?? 9
  const br = BUCKET_RANK[b.bucket] ?? 9
  if (ar !== br) return ar < br
  return (a.interaction_count || 0) > (b.interaction_count || 0)
}
