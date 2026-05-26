// IB tool — Target List Builder.
//
// On a sell-side mandate, partners need to assemble a list of likely
// acquirers (strategic + financial). This panel lets them:
//   - See/edit the list with status (identified → contacted → engaged
//     → passed/closed) and warmth (strong / warm / cool / cold)
//   - One-click AI seed: Gemini suggests 12 plausible acquirers from
//     the deal's sector + geography + brief, with a one-line
//     rationale. User accepts/rejects, list lands in public.target_list.
//
// Backend: public.target_list (one row per target per deal). RLS
// scoped to org_id (auto-set via trigger). The component reads from
// the table on mount; AI seed writes new rows via supabase.from.

import { useEffect, useMemo, useState } from 'react'
import { Plus, Sparkles, Loader2, Trash2, RefreshCw } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { llmCall } from '../lib/gemini.js'
import { useToast } from './Toast.jsx'
import { humanError } from '../lib/userError.js'
import StatusPill from './ui/StatusPill.jsx'
import AIBadge from './ui/AIBadge.jsx'

const STATUS_TONE = {
  identified: 'neutral',
  contacted:  'progress',
  engaged:    'progress',
  passed:     'danger',
  closed:     'success',
}
const WARMTH_TONE = {
  strong: 'success',
  warm:   'progress',
  cool:   'neutral',
  cold:   'neutral',
}
const STATUSES = ['identified', 'contacted', 'engaged', 'passed', 'closed']
const WARMTHS  = ['strong', 'warm', 'cool', 'cold']

export default function TargetListPanel({ deal }) {
  const toast = useToast()
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [addingManual, setAddingManual] = useState(false)
  const [manualName, setManualName]     = useState('')

  async function load() {
    if (!isSupabaseConfigured) { setLoading(false); return }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('target_list')
        .select('*')
        .eq('deal_id', deal.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      setRows(data || [])
    } catch (e) {
      toast.error(humanError(e, 'Could not load target list.'))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { if (deal?.id) load() }, [deal?.id])

  async function aiSeed() {
    if (!deal) return
    setSeeding(true)
    try {
      const prompt = buildSeedPrompt(deal)
      const text = await llmCall(prompt, {
        temperature: 0.3,
        maxOutputTokens: 800,
        actionType: 'target_list_seed',
        responseMimeType: 'application/json'
      })
      const parsed = safeParse(text)
      if (!Array.isArray(parsed)) throw new Error('Model returned an unexpected shape.')
      const inserts = parsed.slice(0, 15).map(t => ({
        deal_id:      deal.id,
        company_name: String(t.name || '').slice(0, 120),
        company_type: ['strategic','financial','fund'].includes(t.type) ? t.type : 'strategic',
        warmth:       'cold',
        status:       'identified',
        rationale:    String(t.why || '').slice(0, 280)
      })).filter(r => r.company_name)
      if (inserts.length === 0) throw new Error('Model returned no usable targets.')
      const { error } = await supabase.from('target_list').insert(inserts)
      if (error) throw error
      toast.success(`Added ${inserts.length} targets to the list.`)
      await load()
    } catch (e) {
      toast.error(humanError(e, 'AI seed failed.'))
    } finally {
      setSeeding(false)
    }
  }

  async function addManual() {
    const name = manualName.trim()
    if (!name) return
    try {
      const { error } = await supabase.from('target_list').insert({
        deal_id: deal.id, company_name: name
      })
      if (error) throw error
      setManualName(''); setAddingManual(false)
      await load()
    } catch (e) {
      toast.error(humanError(e, 'Could not add target.'))
    }
  }

  async function update(row, patch) {
    // Optimistic update — flip locally so the dropdown change feels instant.
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, ...patch } : r))
    try {
      const { error } = await supabase.from('target_list').update(patch).eq('id', row.id)
      if (error) throw error
    } catch (e) {
      toast.error(humanError(e, 'Could not save change.'))
      load()
    }
  }

  async function remove(row) {
    if (!confirm(`Remove ${row.company_name} from the target list?`)) return
    try {
      const { error } = await supabase.from('target_list').delete().eq('id', row.id)
      if (error) throw error
      await load()
    } catch (e) {
      toast.error(humanError(e, 'Could not remove target.'))
    }
  }

  const counts = useMemo(() => {
    const c = { total: rows.length }
    for (const r of rows) c[r.status] = (c[r.status] || 0) + 1
    return c
  }, [rows])

  return (
    <div className="vl-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-valence-text">Target list</h3>
            <AIBadge />
            <span className="text-xs text-valence-muted">· {counts.total} target{counts.total === 1 ? '' : 's'}</span>
          </div>
          <p className="text-xs text-valence-muted mt-0.5">
            Who you'd take this mandate to. Track each acquirer / investor by status + warmth.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={aiSeed} disabled={seeding} className="vl-btn-secondary text-xs">
            {seeding ? <><Loader2 className="h-3 w-3 animate-spin" /> Seeding…</> : <><Sparkles className="h-3 w-3" /> AI seed</>}
          </button>
          <button onClick={() => setAddingManual(v => !v)} className="vl-btn-ghost text-xs">
            <Plus className="h-3 w-3" /> Add manually
          </button>
        </div>
      </div>

      {addingManual && (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            className="vl-input flex-1 text-sm"
            placeholder="Acquirer / investor name"
            value={manualName}
            onChange={e => setManualName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addManual()}
          />
          <button onClick={addManual} className="vl-btn-primary-sm">Add</button>
        </div>
      )}

      {loading ? (
        <div className="py-6 text-center text-xs text-valence-muted">Loading targets…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-valence-border bg-valence-surface/30 py-8 text-center text-xs text-valence-muted">
          No targets yet. <button onClick={aiSeed} className="font-semibold text-valence-blue hover:underline">Run AI seed</button> to populate from the mandate brief.
        </div>
      ) : (
        <div className="space-y-1.5">
          {rows.map(r => (
            <div key={r.id} className="grid grid-cols-[1fr_120px_120px_28px] gap-2 items-center rounded-lg border border-valence-border bg-valence-surface/50 px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-valence-text">{r.company_name}</p>
                  <span className="text-[10px] text-valence-subtle uppercase">{r.company_type}</span>
                </div>
                {r.rationale && <p className="truncate text-[11px] text-valence-muted mt-0.5">{r.rationale}</p>}
              </div>
              <select value={r.warmth} onChange={e => update(r, { warmth: e.target.value })} className="vl-input text-[11px] py-1">
                {WARMTHS.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
              <select value={r.status} onChange={e => update(r, { status: e.target.value })} className="vl-input text-[11px] py-1">
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button onClick={() => remove(r)} className="vl-btn-ghost p-1 text-valence-subtle hover:text-valence-danger" title="Remove">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function buildSeedPrompt(deal) {
  return `You're a senior associate at a Mumbai/London advisory firm. Given the mandate below, list 12 plausible acquirers / investors who could be on the target list. Mix strategic acquirers (industry players) and financial sponsors (PE/VC funds active in this space).

MANDATE:
- Client: ${deal.client_name}
- Sector: ${deal.sector || 'unspecified'}
- Geography: ${deal.geography || 'unspecified'}
- Side: ${deal.ma_side || deal.side || '—'}
- Subtype: ${deal.deal_subtype || deal.deal_type || '—'}
- Notes: ${(deal.notes || '').slice(0, 300)}
- Acquisition brief: ${(deal.acquisition_brief || '').slice(0, 300)}

Return a JSON array of 12 objects, each with this exact shape:
[{"name": "<company>", "type": "strategic" | "financial" | "fund", "why": "<one short sentence — sector / geography / past deal>"}]

Strict rules:
- Real, recognisable firms only. Skip if you cannot name plausible ones.
- Mix of strategic + financial.
- "why" is one sentence, plain language. No marketing tone.
- Output nothing but the JSON array.`
}

function safeParse(s) {
  if (!s) return null
  try { return JSON.parse(s) } catch {}
  const m = String(s).match(/\[[\s\S]*\]/)
  if (m) { try { return JSON.parse(m[0]) } catch {} }
  return null
}
