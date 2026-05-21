// ValenceTeamProfilePanel — for a Valence team member's own profile.
//
// Two sections:
//   1. "Top Connector To" — Strong+Warm counts per company_type / sector
//      / geography, sourced from the super_connectors_by_* views. Only
//      categories with >= 3 connections show, so the profile stays focused.
//   2. "Network" — all external contacts grouped by bucket (Strong, Warm,
//      Cool, Cold), each expandable. Click a person to open their profile.
//
// The inverse of ValenceConnectionsPanel — that one lives on external
// people; this one lives on Valence team members.

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Building2, Globe, Sparkles, ChevronRight, ChevronDown, Clock } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import RelationshipChip, { humanDate } from './RelationshipChip.jsx'

const BUCKETS = ['strong', 'warm', 'cool', 'cold']
const BUCKET_LABEL = { strong: 'Strong', warm: 'Warm', cool: 'Cool', cold: 'Cold' }
const COMPANY_TYPE_LABEL = {
  pe_fund: 'PE funds',
  vc_fund: 'VC funds',
  investment_bank: 'Investment banks',
  family_office: 'Family offices',
  corporate_buyer: 'Corporate buyers',
  founder: 'Founders',
  lawyer: 'Lawyers',
  banker: 'Bankers',
  other: 'Other'
}
const MIN_CONNECTIONS_TO_SHOW = 3

export default function ValenceTeamProfilePanel({ valencePersonId }) {
  const [byCompanyType, setByCompanyType] = useState([])
  const [bySector, setBySector] = useState([])
  const [byGeography, setByGeography] = useState([])
  const [network, setNetwork] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!valencePersonId || !isSupabaseConfigured) { setLoading(false); return }
    let alive = true
    ;(async () => {
      setLoading(true); setError(null)
      try {
        const [ct, sec, geo, net] = await Promise.all([
          supabase.from('super_connectors_by_company_type')
            .select('company_type, strong_warm_count, total_count')
            .eq('valence_person_id', valencePersonId)
            .order('strong_warm_count', { ascending: false }),
          supabase.from('super_connectors_by_sector')
            .select('sector_tag, strong_warm_count, total_count')
            .eq('valence_person_id', valencePersonId)
            .order('strong_warm_count', { ascending: false }),
          supabase.from('super_connectors_by_geography')
            .select('geo_tag, strong_warm_count, total_count')
            .eq('valence_person_id', valencePersonId)
            .order('strong_warm_count', { ascending: false }),
          supabase.from('relationship_strength')
            .select('external_person_id, bucket, interaction_count, last_interaction_at')
            .eq('valence_person_id', valencePersonId)
            .order('last_interaction_at', { ascending: false, nullsFirst: false })
        ])
        if (!alive) return

        setByCompanyType((ct.data || []).filter(r => (r.strong_warm_count || 0) >= MIN_CONNECTIONS_TO_SHOW))
        setBySector((sec.data || []).filter(r => (r.strong_warm_count || 0) >= MIN_CONNECTIONS_TO_SHOW))
        setByGeography((geo.data || []).filter(r => (r.strong_warm_count || 0) >= MIN_CONNECTIONS_TO_SHOW))

        // Resolve external person names in one round-trip.
        const externalIds = (net.data || []).map(r => r.external_person_id)
        let nameMap = new Map()
        if (externalIds.length > 0) {
          const { data: ps } = await supabase.from('people')
            .select('id, full_name, company, role')
            .in('id', externalIds)
          nameMap = new Map((ps || []).map(p => [p.id, p]))
        }
        const enriched = (net.data || []).map(r => ({
          external_person_id: r.external_person_id,
          full_name: nameMap.get(r.external_person_id)?.full_name || 'Unknown',
          company: nameMap.get(r.external_person_id)?.company || null,
          role: nameMap.get(r.external_person_id)?.role || null,
          bucket: r.bucket,
          interaction_count: r.interaction_count,
          last_interaction_at: r.last_interaction_at
        }))
        setNetwork(enriched)
      } catch (e) {
        setError(e?.message || 'Could not load team profile')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [valencePersonId])

  if (loading) {
    return (
      <section className="vl-card p-5 space-y-2">
        <p className="vl-eyebrow-ink">Valence team profile</p>
        <div className="h-6 w-32 rounded bg-valence-surface animate-pulse" />
        <div className="h-12 w-full rounded bg-valence-surface animate-pulse" />
      </section>
    )
  }

  if (error) {
    return (
      <section className="vl-card p-5">
        <p className="vl-eyebrow-ink">Valence team profile</p>
        <p className="mt-2 text-xs text-valence-danger">{error}</p>
      </section>
    )
  }

  const hasAnyTopConnector = byCompanyType.length || bySector.length || byGeography.length
  const networkByBucket = useMemo(() => {
    const groups = { strong: [], warm: [], cool: [], cold: [] }
    for (const row of network) {
      if (groups[row.bucket]) groups[row.bucket].push(row)
    }
    return groups
  }, [network])

  return (
    <section className="space-y-4">
      {/* Top Connector To */}
      {hasAnyTopConnector ? (
        <div className="vl-card p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-valence-blue-soft p-2 text-valence-blue">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="vl-eyebrow-ink">Top connector to</p>
              <p className="mt-0.5 text-[11px] text-valence-muted">
                Categories with {MIN_CONNECTIONS_TO_SHOW}+ strong / warm relationships.
              </p>
            </div>
          </div>

          {byCompanyType.length > 0 && (
            <CategoryRows
              icon={Building2}
              title="By company type"
              rows={byCompanyType.map(r => ({
                label: COMPANY_TYPE_LABEL[r.company_type] || r.company_type,
                strongWarm: r.strong_warm_count,
                total: r.total_count
              }))}
            />
          )}
          {bySector.length > 0 && (
            <CategoryRows
              icon={Sparkles}
              title="By sector"
              rows={bySector.map(r => ({
                label: r.sector_tag,
                strongWarm: r.strong_warm_count,
                total: r.total_count
              }))}
            />
          )}
          {byGeography.length > 0 && (
            <CategoryRows
              icon={Globe}
              title="By geography"
              rows={byGeography.map(r => ({
                label: r.geo_tag,
                strongWarm: r.strong_warm_count,
                total: r.total_count
              }))}
            />
          )}
        </div>
      ) : (
        <div className="vl-card p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-valence-blue-soft p-2 text-valence-blue">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="vl-eyebrow-ink">Top connector to</p>
              <p className="mt-1 text-sm text-valence-text">
                No category breakdown yet.
              </p>
              <p className="mt-2 text-[11px] text-valence-muted">
                Categories appear once external contacts are classified by type / sector /
                geography (enrichment runs after they're added).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Network */}
      <NetworkSection groups={networkByBucket} total={network.length} valencePersonId={valencePersonId} />
    </section>
  )
}

function CategoryRows({ icon: Icon, title, rows }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-valence-muted flex items-center gap-1.5">
        <Icon className="h-3 w-3" /> {title}
      </p>
      <ul className="mt-2 divide-y divide-valence-border/60">
        {rows.map(r => (
          <li key={r.label} className="py-2 flex items-center justify-between gap-3 text-sm">
            <span className="text-valence-text truncate">{r.label}</span>
            <span className="text-[11px] text-valence-muted tabular-nums">
              <span className="font-semibold text-valence-text">{r.strongWarm}</span> strong / warm
              <span className="text-valence-subtle"> · {r.total} total</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function NetworkSection({ groups, total, valencePersonId }) {
  const [open, setOpen] = useState({ strong: true, warm: true, cool: false, cold: false })

  if (total === 0) {
    return (
      <div className="vl-card p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-valence-blue-soft p-2 text-valence-blue">
            <Users className="h-4 w-4" />
          </div>
          <div>
            <p className="vl-eyebrow-ink">Network</p>
            <p className="mt-1 text-sm text-valence-text">No tracked relationships yet.</p>
            <p className="mt-2 text-[11px] text-valence-muted">
              Log interactions in People or via the Chrome extension. Relationships are
              re-scored every night at 3 AM IST.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="vl-card p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-valence-blue-soft p-2 text-valence-blue">
          <Users className="h-4 w-4" />
        </div>
        <div>
          <p className="vl-eyebrow-ink">Network</p>
          <p className="mt-0.5 text-[11px] text-valence-muted">
            {total} contact{total === 1 ? '' : 's'} with logged relationships.
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {BUCKETS.map(b => {
          const rows = groups[b] || []
          if (rows.length === 0) return null
          const isOpen = open[b]
          return (
            <li key={b} className="rounded-lg border border-valence-border/60">
              <button
                onClick={() => setOpen(o => ({ ...o, [b]: !o[b] }))}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-valence-surface/40 transition"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-valence-muted shrink-0" />
                          : <ChevronRight className="h-3.5 w-3.5 text-valence-muted shrink-0" />}
                  <RelationshipChip bucket={b} />
                  <span className="text-xs text-valence-muted">
                    {rows.length} contact{rows.length === 1 ? '' : 's'}
                  </span>
                </div>
              </button>
              {isOpen && (
                <ol className="border-t border-valence-border/60 divide-y divide-valence-border/40">
                  {rows.slice(0, 50).map(r => (
                    <li key={r.external_person_id} className="px-3 py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <Link to={`/people?open=${r.external_person_id}`} className="text-sm font-semibold text-valence-text hover:text-valence-blue truncate block">
                          {r.full_name}
                        </Link>
                        {(r.company || r.role) && (
                          <p className="text-[11px] text-valence-muted truncate">
                            {[r.role, r.company].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-valence-muted tabular-nums">
                          {r.interaction_count} interaction{r.interaction_count === 1 ? '' : 's'}
                        </p>
                        {r.last_interaction_at && (
                          <p className="text-[10px] text-valence-muted inline-flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" /> {humanDate(r.last_interaction_at)}
                          </p>
                        )}
                      </div>
                      <Link
                        to={`/timeline/${valencePersonId}/${r.external_person_id}`}
                        className="text-[11px] font-semibold text-valence-blue hover:text-valence-blue-hover shrink-0"
                      >
                        Timeline
                      </Link>
                    </li>
                  ))}
                  {rows.length > 50 && (
                    <li className="px-3 py-2 text-[11px] text-valence-muted text-center">
                      Showing top 50 of {rows.length} {b} contacts.
                    </li>
                  )}
                </ol>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
