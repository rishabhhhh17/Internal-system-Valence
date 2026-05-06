import { useEffect, useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import Drawer from './Drawer.jsx'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import {
  PURPOSES, TYPES, outcomesForPurpose, outcomeLabel, purposeLabel
} from '../lib/interactions.js'

const BLANK = {
  interaction_purpose: 'pitch_for_mandate',
  type: 'intro_call',
  counterparty_name: '',
  counterparty_company: '',
  counterparty_role: '',
  outcome: 'to_followup',
  notes: '',
  follow_up_date: '',
  lead_owner: '',
  deal_id: ''
}

export default function InteractionDrawer({ open, onClose, existing, onSubmit }) {
  const [form, setForm] = useState(BLANK)
  const [deals, setDeals] = useState([])

  useEffect(() => {
    if (!open) return
    setForm(existing ? { ...BLANK, ...normalize(existing) } : BLANK)
  }, [open, existing])

  // Pull deal options for the optional "Linked deal" picker.
  useEffect(() => {
    if (!open || !isSupabaseConfigured) return
    ;(async () => {
      const { data } = await supabase.from('deals').select('id, client_name, stage').order('created_at', { ascending: false }).limit(200)
      setDeals(data || [])
    })()
  }, [open])

  // When the purpose changes, snap the outcome back to the first valid option.
  useEffect(() => {
    const allowed = outcomesForPurpose(form.interaction_purpose)
    if (allowed.length && !allowed.includes(form.outcome)) {
      setForm(f => ({ ...f, outcome: allowed[0] }))
    }
  }, [form.interaction_purpose])

  const allowedOutcomes = useMemo(() => outcomesForPurpose(form.interaction_purpose), [form.interaction_purpose])
  const purposeBlurb = PURPOSES.find(p => p.id === form.interaction_purpose)?.blurb

  function update(patch) { setForm(f => ({ ...f, ...patch })) }

  function submit(e) {
    e.preventDefault()
    if (!form.counterparty_name.trim()) return
    const payload = {
      interaction_purpose: form.interaction_purpose,
      type: form.type,
      counterparty_name: form.counterparty_name.trim(),
      counterparty_company: form.counterparty_company.trim() || null,
      counterparty_role: form.counterparty_role.trim() || null,
      outcome: form.outcome,
      notes: form.notes.trim() || null,
      follow_up_date: form.follow_up_date || null,
      lead_owner: form.lead_owner.trim() || null,
      deal_id: form.deal_id || null
    }
    onSubmit?.(payload, existing?.id)
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={existing ? `Edit interaction · ${existing.counterparty_name}` : 'Log a new interaction'}
      footer={
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="vl-btn-secondary">Cancel</button>
          <button type="submit" form="interaction-form" className="vl-btn-primary">{existing ? 'Save changes' : 'Log interaction'}</button>
        </div>
      }
    >
      <form id="interaction-form" onSubmit={submit} className="space-y-5">
        <div>
          <label className="vl-label">Purpose</label>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {PURPOSES.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => update({ interaction_purpose: p.id })}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                  form.interaction_purpose === p.id
                    ? 'border-valence-blue/40 bg-valence-blue-soft text-valence-text'
                    : 'border-valence-border bg-white text-valence-muted hover:text-valence-text'
                }`}
              >
                <p className="font-semibold">{p.label}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-valence-subtle">{p.blurb}</p>
              </button>
            ))}
          </div>
          {purposeBlurb && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-valence-muted">
              <Sparkles className="h-3 w-3 text-valence-blue" /> Outcomes available: {allowedOutcomes.map(outcomeLabel).join(' · ')}
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="vl-label">Counterparty name <span className="text-valence-danger">*</span></label>
            <input className="vl-input mt-1.5" required value={form.counterparty_name} onChange={e => update({ counterparty_name: e.target.value })} placeholder="Rohit Bansal" />
          </div>
          <div>
            <label className="vl-label">Company</label>
            <input className="vl-input mt-1.5" value={form.counterparty_company} onChange={e => update({ counterparty_company: e.target.value })} placeholder="Nimbus Health" />
          </div>
          <div>
            <label className="vl-label">Role</label>
            <input className="vl-input mt-1.5" value={form.counterparty_role} onChange={e => update({ counterparty_role: e.target.value })} placeholder="CEO" />
          </div>
          <div>
            <label className="vl-label">Lead owner</label>
            <input className="vl-input mt-1.5" value={form.lead_owner} onChange={e => update({ lead_owner: e.target.value })} placeholder="Neha Jain" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="vl-label">Type</label>
            <select className="vl-input mt-1.5" value={form.type} onChange={e => update({ type: e.target.value })}>
              {TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="vl-label">Outcome</label>
            <select className="vl-input mt-1.5" value={form.outcome} onChange={e => update({ outcome: e.target.value })}>
              {allowedOutcomes.map(o => <option key={o} value={o}>{outcomeLabel(o)}</option>)}
            </select>
            <p className="mt-1.5 text-[11px] text-valence-muted">Outcomes scoped to {purposeLabel(form.interaction_purpose).toLowerCase()}.</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="vl-label">Follow-up date</label>
            <input type="date" className="vl-input mt-1.5" value={form.follow_up_date || ''} onChange={e => update({ follow_up_date: e.target.value })} />
          </div>
          <div>
            <label className="vl-label">Linked deal <span className="text-valence-subtle">(optional)</span></label>
            <select className="vl-input mt-1.5" value={form.deal_id || ''} onChange={e => update({ deal_id: e.target.value })}>
              <option value="">— None —</option>
              {deals.map(d => <option key={d.id} value={d.id}>{d.client_name} · {d.stage}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="vl-label">Notes</label>
          <textarea
            className="vl-input mt-1.5 min-h-[140px] leading-relaxed"
            value={form.notes}
            onChange={e => update({ notes: e.target.value })}
            placeholder="What was discussed, what was agreed, what's the next step…"
          />
        </div>
      </form>
    </Drawer>
  )
}

function normalize(row) {
  return {
    ...row,
    follow_up_date: row.follow_up_date ? String(row.follow_up_date).slice(0, 10) : '',
    counterparty_company: row.counterparty_company || '',
    counterparty_role: row.counterparty_role || '',
    notes: row.notes || '',
    lead_owner: row.lead_owner || '',
    deal_id: row.deal_id || ''
  }
}
