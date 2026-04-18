import { useEffect, useMemo, useState } from 'react'
import { Check, Circle, AlertTriangle, ListChecks } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { STAGE_CHECKLISTS, progress } from '../lib/checklists.js'
import { stageMeta } from '../lib/stages.js'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from './Toast.jsx'

export default function StageGate({ deal, onChanged }) {
  const toast = useToast()
  const { profile } = useAuth()
  const [items, setItems] = useState([])        // ticked rows from DB
  const [loading, setLoading] = useState(true)
  const [stage, setStage] = useState(deal.stage)

  useEffect(() => { setStage(deal.stage) }, [deal.stage])
  useEffect(() => { if (deal?.id) load() }, [deal?.id, stage])

  async function load() {
    setLoading(true)
    if (!isSupabaseConfigured) { setItems([]); setLoading(false); return }
    const { data } = await supabase
      .from('deal_checklist')
      .select('*')
      .eq('deal_id', deal.id)
      .eq('stage', stage)
    setItems(data || [])
    setLoading(false)
  }

  const doneKeys = useMemo(() => new Set(items.map(i => i.item_key)), [items])
  const template = STAGE_CHECKLISTS[stage] || []
  const stats = useMemo(() => progress(doneKeys, stage), [doneKeys, stage])

  async function toggle(key) {
    if (!isSupabaseConfigured) return
    const already = doneKeys.has(key)
    if (already) {
      const row = items.find(i => i.item_key === key)
      const { error } = await supabase.from('deal_checklist').delete().eq('id', row.id)
      if (error) return toast.error(error.message)
      setItems(prev => prev.filter(i => i.id !== row.id))
    } else {
      const { data, error } = await supabase.from('deal_checklist').insert({
        deal_id:  deal.id,
        stage,
        item_key: key,
        done_by:  profile?.email || null
      }).select().single()
      if (error) return toast.error(error.message)
      setItems(prev => [...prev, data])
    }
    onChanged?.()
  }

  const allStages = Object.keys(STAGE_CHECKLISTS)

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-valence-border bg-gradient-to-br from-valence-blue-soft via-white to-white p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-valence-blue-soft ring-1 ring-valence-blue/30 shrink-0">
            <ListChecks className="h-4 w-4 text-valence-blue" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3">
              <p className="font-display text-lg font-bold text-valence-text">Stage gate</p>
              <StageSwitcher current={stage} allStages={allStages} onPick={setStage} dealStage={deal.stage} />
            </div>
            <p className="mt-1 text-xs text-valence-muted leading-relaxed">
              Checklist for <b className="text-valence-text">{stage}</b>. {stats.blocked
                ? <span className="text-valence-warning">{stats.required - stats.doneRequired} required item{stats.required - stats.doneRequired === 1 ? '' : 's'} outstanding.</span>
                : stats.total === 0
                  ? 'No items for this stage.'
                  : <span className="text-valence-success">All required items complete.</span>}
            </p>

            {/* progress bar */}
            <div className="mt-3 h-1.5 w-full rounded-full bg-valence-surface overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${stats.blocked ? 'bg-valence-warning' : 'bg-valence-success'}`}
                style={{ width: `${stats.percent}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-valence-subtle tabular-nums">
              {stats.done} of {stats.total} done · {stats.doneRequired}/{stats.required} required
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-11 rounded-lg bg-valence-surface animate-pulse" />)}
        </div>
      ) : template.length === 0 ? (
        <p className="rounded-lg border border-valence-border bg-valence-surface px-4 py-4 text-sm text-valence-muted text-center">
          No checklist items defined for this stage.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {template.map(item => {
            const done = doneKeys.has(item.key)
            const row = items.find(i => i.item_key === item.key)
            return (
              <li key={item.key}>
                <button
                  onClick={() => toggle(item.key)}
                  className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition ${
                    done
                      ? 'border-valence-success/30 bg-valence-success-soft/40'
                      : 'border-valence-border bg-white hover:border-valence-ink/20'
                  }`}
                >
                  <div className={`grid h-5 w-5 place-items-center rounded-full border-2 shrink-0 transition ${
                    done ? 'border-valence-success bg-valence-success' : 'border-valence-faint bg-white'
                  }`}>
                    {done && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${done ? 'text-valence-text line-through' : 'text-valence-text'}`}>
                      {item.label}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-valence-muted">
                      {item.required && (
                        <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                          done
                            ? 'border-valence-success/30 text-valence-success'
                            : 'border-valence-warning/30 text-valence-warning'
                        }`}>
                          Required
                        </span>
                      )}
                      {row?.done_by && <span>by {row.done_by}</span>}
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function StageSwitcher({ current, allStages, onPick, dealStage }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="rounded-md border border-valence-border bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-valence-muted hover:border-valence-ink/30"
      >
        {current === dealStage ? current : `${current} (preview)`}
      </button>
      {open && (
        <div
          onMouseLeave={() => setOpen(false)}
          className="absolute right-0 top-full mt-1 z-20 w-44 rounded-lg border border-valence-border-strong bg-white shadow-valence-lg overflow-hidden animate-slide-up-sm"
        >
          <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-valence-subtle">Preview stage</p>
          <ul className="pb-1 max-h-72 overflow-y-auto">
            {allStages.map(s => (
              <li key={s}>
                <button
                  onClick={() => { onPick(s); setOpen(false) }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition ${
                    s === current ? 'bg-valence-blue-soft text-valence-text' : 'text-valence-muted hover:bg-valence-surface hover:text-valence-text'
                  }`}
                >
                  {s}
                  {s === dealStage && <span className="ml-auto text-[9px] text-valence-blue">current</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
