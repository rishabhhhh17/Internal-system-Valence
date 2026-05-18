import { useEffect, useMemo, useState } from 'react'
import { Check, AlertTriangle, ListChecks, Plus, X, Trash2, CalendarCheck } from 'lucide-react'
import { format } from 'date-fns'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { STAGE_CHECKLISTS, progress } from '../lib/checklists.js'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from './Toast.jsx'
import { useConfirm } from './ConfirmDialog.jsx'

// Stage-gate checklist per deal.
//
// Two kinds of items live side-by-side in this view:
//   * Template items  — defined in src/lib/checklists.js per-stage. A row is
//                       inserted in `deal_checklist` only WHEN the user
//                       checks the item; un-checking deletes the row.
//                       In the DB row, `label` is NULL (we look up the
//                       human label by `item_key` from STAGE_CHECKLISTS).
//   * Custom items    — user-authored, free-form. A row is always present
//                       in `deal_checklist` once the user adds the item;
//                       toggling done flips the `done` flag in place.
//                       `label` is the visible text; `item_key` is a stable
//                       `custom:<uuid>` identifier; `required` opt-in.
//
// `done_at` is stamped on every "check" so the user can see when each item
// was completed — the audit trail that makes the checklist credible.

export default function StageGate({ deal, onChanged }) {
  const toast = useToast()
  const confirm = useConfirm()
  const { profile } = useAuth()
  const [items, setItems] = useState([])        // all rows for (deal,stage)
  const [loading, setLoading] = useState(true)
  const [stage, setStage] = useState(deal.stage)

  // Custom-item composer state
  const [addOpen, setAddOpen]       = useState(false)
  const [addLabel, setAddLabel]     = useState('')
  const [addRequired, setAddRequired] = useState(false)
  const [adding, setAdding]         = useState(false)

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
      .order('created_at', { ascending: true })
    setItems(data || [])
    setLoading(false)
  }

  // Indexed views over the rows so the render is cheap.
  // Template items: row exists ⇒ done. Map by item_key.
  // Custom items: a row that has label set. The row carries its own done flag.
  const rowByKey       = useMemo(() => Object.fromEntries(items.map(i => [i.item_key, i])), [items])
  const customItems    = useMemo(() => items.filter(i => i.label && String(i.item_key).startsWith('custom:')), [items])

  // The merged "done" set: template items considered done if a row exists,
  // custom items considered done if their row's `done` flag is true.
  const doneKeys = useMemo(() => {
    const set = new Set()
    for (const i of items) {
      if (String(i.item_key).startsWith('custom:')) {
        if (i.done) set.add(i.item_key)
      } else {
        set.add(i.item_key)
      }
    }
    return set
  }, [items])

  const template = STAGE_CHECKLISTS[stage] || []
  const stats = useMemo(() => {
    // Compose required + total over both template + custom items.
    const tplRequired = template.filter(t => t.required).length
    const tplDone     = template.filter(t => doneKeys.has(t.key)).length
    const tplDoneReq  = template.filter(t => t.required && doneKeys.has(t.key)).length
    const cusRequired = customItems.filter(c => c.required).length
    const cusDone     = customItems.filter(c => doneKeys.has(c.item_key)).length
    const cusDoneReq  = customItems.filter(c => c.required && doneKeys.has(c.item_key)).length
    const total       = template.length + customItems.length
    const done        = tplDone + cusDone
    const required    = tplRequired + cusRequired
    const doneRequired = tplDoneReq + cusDoneReq
    return {
      total, done, required, doneRequired,
      percent: total === 0 ? 100 : Math.round((done / total) * 100),
      blocked: doneRequired < required
    }
  }, [template, customItems, doneKeys])

  async function toggleTemplate(itemKey) {
    if (!isSupabaseConfigured) return
    const existing = rowByKey[itemKey]
    if (existing) {
      const { error } = await supabase.from('deal_checklist').delete().eq('id', existing.id)
      if (error) return toast.error(error.message)
      setItems(prev => prev.filter(i => i.id !== existing.id))
    } else {
      const { data, error } = await supabase.from('deal_checklist').insert({
        deal_id:  deal.id,
        stage,
        item_key: itemKey,
        done:     true,
        done_by:  profile?.email || null,
        done_at:  new Date().toISOString()
      }).select().single()
      if (error) return toast.error(error.message)
      setItems(prev => [...prev, data])
    }
    onChanged?.()
  }

  async function toggleCustom(row) {
    if (!isSupabaseConfigured) return
    const nextDone = !row.done
    const patch = nextDone
      ? { done: true,  done_by: profile?.email || null, done_at: new Date().toISOString() }
      : { done: false, done_by: null,                   done_at: null }
    const { data, error } = await supabase.from('deal_checklist').update(patch).eq('id', row.id).select().single()
    if (error) return toast.error(error.message)
    setItems(prev => prev.map(i => i.id === row.id ? data : i))
    onChanged?.()
  }

  async function addCustom() {
    const label = addLabel.trim()
    if (!label) { setAddOpen(false); return }
    setAdding(true)
    try {
      if (!isSupabaseConfigured) {
        toast.error('Connect Supabase to add custom items.')
        return
      }
      const item_key = `custom:${crypto.randomUUID()}`
      const { data, error } = await supabase.from('deal_checklist').insert({
        deal_id:  deal.id,
        stage,
        item_key,
        label,
        required: addRequired,
        done:     false
      }).select().single()
      if (error) throw error
      setItems(prev => [...prev, data])
      setAddLabel(''); setAddRequired(false); setAddOpen(false)
      onChanged?.()
    } catch (err) {
      toast.error(err?.message || 'Could not add item')
    } finally {
      setAdding(false)
    }
  }

  async function deleteCustom(row) {
    const ok = await confirm({
      title: `Delete "${row.label}"?`,
      body: 'Custom checklist items can be removed. Template items cannot.',
      destructive: true,
      confirmLabel: 'Delete'
    })
    if (!ok) return
    const { error } = await supabase.from('deal_checklist').delete().eq('id', row.id)
    if (error) return toast.error(error.message)
    setItems(prev => prev.filter(i => i.id !== row.id))
    onChanged?.()
  }

  const allStages = Object.keys(STAGE_CHECKLISTS)

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-valence-border bg-gradient-to-br from-valence-blue-soft via-valence-elevated to-valence-elevated p-5">
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
                  ? 'No items for this stage. Add one below.'
                  : <span className="text-valence-success">All required items complete.</span>}
            </p>
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
      ) : (
        <ul className="space-y-1.5">
          {template.map(item => {
            const row = rowByKey[item.key]
            const done = !!row
            return (
              <ChecklistRow
                key={item.key}
                done={done}
                label={item.label}
                required={item.required}
                doneAt={row?.done_at}
                doneBy={row?.done_by}
                onToggle={() => toggleTemplate(item.key)}
              />
            )
          })}
          {customItems.map(row => (
            <ChecklistRow
              key={row.id}
              done={row.done}
              label={row.label}
              required={row.required}
              doneAt={row.done_at}
              doneBy={row.done_by}
              custom
              onToggle={() => toggleCustom(row)}
              onDelete={() => deleteCustom(row)}
            />
          ))}
        </ul>
      )}

      {/* Custom item composer */}
      {addOpen ? (
        <form
          onSubmit={e => { e.preventDefault(); addCustom() }}
          className="rounded-lg border border-valence-blue/30 bg-valence-blue-soft/30 p-3 space-y-2"
        >
          <input
            autoFocus
            value={addLabel}
            onChange={e => setAddLabel(e.target.value)}
            placeholder="e.g. Term sheet sent to legal"
            className="vl-input bg-valence-elevated"
          />
          <div className="flex items-center justify-between gap-2">
            <label className="inline-flex items-center gap-2 text-[11px] text-valence-muted cursor-pointer">
              <input
                type="checkbox"
                checked={addRequired}
                onChange={e => setAddRequired(e.target.checked)}
                className="rounded border-valence-border"
              />
              Mark as required
            </label>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => { setAddOpen(false); setAddLabel('') }} className="vl-btn-ghost text-xs">
                <X className="h-3 w-3" /> Cancel
              </button>
              <button type="submit" disabled={adding || !addLabel.trim()} className="vl-btn-primary text-xs">
                <Plus className="h-3.5 w-3.5" /> {adding ? 'Adding…' : 'Add item'}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setAddOpen(true)}
          className="w-full rounded-lg border border-dashed border-valence-border bg-valence-elevated px-4 py-3 text-sm text-valence-muted hover:text-valence-text hover:border-valence-ink/30 transition inline-flex items-center justify-center gap-2"
        >
          <Plus className="h-3.5 w-3.5" /> Add a custom item for this stage
        </button>
      )}
    </div>
  )
}

// One checklist row. `custom` adds a delete affordance on hover.
function ChecklistRow({ done, label, required, doneAt, doneBy, custom, onToggle, onDelete }) {
  return (
    <li>
      <div
        className={`group flex items-center gap-3 rounded-lg border px-4 py-3 transition ${
          done ? 'border-valence-success/30 bg-valence-success-soft/40' : 'border-valence-border bg-valence-elevated hover:border-valence-ink/20'
        }`}
      >
        <button onClick={onToggle} className="flex flex-1 items-center gap-3 text-left min-w-0">
          <div className={`grid h-5 w-5 place-items-center rounded-full border-2 shrink-0 transition ${
            done ? 'border-valence-success bg-valence-success' : 'border-valence-faint bg-valence-elevated'
          }`}>
            {done && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold ${done ? 'text-valence-text line-through' : 'text-valence-text'}`}>
              {label}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-valence-muted">
              {required && (
                <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                  done ? 'border-valence-success/30 text-valence-success' : 'border-valence-warning/30 text-valence-warning'
                }`}>
                  Required
                </span>
              )}
              {custom && (
                <span className="inline-flex items-center gap-1 rounded-full border border-valence-blue/30 bg-valence-blue-soft px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-valence-blue">
                  Custom
                </span>
              )}
              {doneAt && (
                <span className="inline-flex items-center gap-1 text-valence-success">
                  <CalendarCheck className="h-3 w-3" />
                  {format(new Date(doneAt), 'd MMM yyyy')}
                </span>
              )}
              {doneBy && <span>by {doneBy}</span>}
            </div>
          </div>
        </button>
        {custom && onDelete && (
          <button
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 transition p-1 text-valence-subtle hover:text-valence-danger"
            title="Delete custom item"
            aria-label="Delete custom item"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </li>
  )
}

function StageSwitcher({ current, allStages, onPick, dealStage }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="rounded-md border border-valence-border bg-valence-elevated px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-valence-muted hover:border-valence-ink/30"
      >
        {current === dealStage ? current : `${current} (preview)`}
      </button>
      {open && (
        <div
          onMouseLeave={() => setOpen(false)}
          className="absolute right-0 top-full mt-1 z-20 w-44 rounded-lg border border-valence-border-strong bg-valence-elevated shadow-valence-lg overflow-hidden animate-slide-up-sm"
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
