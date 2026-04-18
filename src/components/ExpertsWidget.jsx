import { useEffect, useMemo, useState } from 'react'
import { Crown, Award } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { expertsBySector } from '../lib/insights.js'

export default function ExpertsWidget({ deals = [] }) {
  const [docs, setDocs] = useState([])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    supabase.from('documents').select('sector').then(({ data }) => setDocs(data || []))
  }, [])

  const experts = useMemo(() => expertsBySector(deals, docs).slice(0, 6), [deals, docs])

  if (!experts.length) return null

  return (
    <div className="vl-card p-6">
      <div className="mb-3">
        <h2 className="vl-section-title flex items-center gap-2">
          <Crown className="h-4 w-4 text-valence-blue" /> Who knows what
        </h2>
        <p className="text-xs text-valence-muted mt-0.5">Team members with the most surface area in each sector</p>
      </div>
      <ul className="space-y-2.5">
        {experts.map(e => (
          <li key={e.sector} className="flex items-start gap-3">
            <span className="inline-flex w-24 shrink-0 justify-center rounded-full border border-valence-border bg-valence-surface px-2 py-0.5 text-[10px] font-semibold text-valence-blue">
              {e.sector}
            </span>
            <div className="flex-1 flex flex-wrap gap-1.5">
              {e.leaders.map((l, i) => (
                <span
                  key={l.name}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                    i === 0 ? 'border-valence-blue/30 bg-valence-blue-soft text-valence-text' : 'border-valence-border bg-valence-surface text-valence-muted'
                  }`}
                >
                  {i === 0 && <Award className="h-3 w-3 text-valence-blue" />}
                  {l.name}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
