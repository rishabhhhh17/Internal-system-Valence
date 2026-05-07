import { useEffect, useMemo, useState } from 'react'
import { Sparkles, UserCircle, Plus } from 'lucide-react'
import Drawer from './Drawer.jsx'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import {
  PURPOSES, TYPES, outcomesForPurpose, outcomeLabel, purposeLabel
} from '../lib/interactions.js'
import { DEMO_PEOPLE } from '../lib/people.js'
import { useToast } from './Toast.jsx'

const BLANK = {
  interaction_purpose: 'pitch_for_mandate',
  type: 'intro_call',
  person_id: '',                 // FK to people; preferred path
  counterparty_name: '',         // free-text fallback if person_id unset
  counterparty_company: '',
  counterparty_role: '',
  outcome: 'to_followup',
  notes: '',
  follow_up_date: '',
  lead_owner: '',
  deal_id: ''
}

export default function InteractionDrawer({ open, onClose, existing, onSubmit }) {
  const toast = useToast()
  const [form, setForm] = useState(BLANK)
  const [deals, setDeals] = useState([])
  const [people, setPeople] = useState([])
  const [personQuery, setPersonQuery] = useState('')
  const [creatingPerson, setCreatingPerson] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(existing ? { ...BLANK, ...normalize(existing) } : BLANK)
    setPersonQuery('')
  }, [open, existing])

  // Pull deal options for the optional "Linked deal" picker + people for autocomplete.
  useEffect(() => {
    if (!open) return
    if (!isSupabaseConfigured) {
      setPeople(DEMO_PEOPLE)
      return
    }
    ;(async () => {
      const [d, p] = await Promise.all([
        supabase.from('deals').select('id, client_name, stage').order('created_at', { ascending: false }).limit(200),
        supabase.from('people').select('id, full_name, role, company').order('full_name').limit(500)
      ])
      setDeals(d.data || [])
      setPeople(p.data || [])
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

  // The picker shows people whose name fuzzy-matches the typed query.
  const filteredPeople = useMemo(() => {
    const q = personQuery.trim().toLowerCase()
    if (!q) return []
    return people.filter(p =>
      (p.full_name || '').toLowerCase().includes(q) ||
      (p.company   || '').toLowerCase().includes(q)
    ).slice(0, 8)
  }, [people, personQuery])

  function pickPerson(p) {
    update({
      person_id: p.id,
      counterparty_name: p.full_name,
      counterparty_company: p.company || form.counterparty_company,
      counterparty_role: p.role || form.counterparty_role
    })
    setPersonQuery('')
  }

  function clearPerson() {
    update({ person_id: '' })
  }

  async function createPersonInline() {
    const name = personQuery.trim() || form.counterparty_name.trim()
    if (!name) return toast.error('Type a name first')
    setCreatingPerson(true)
    try {
      if (!isSupabaseConfigured) {
        const local = { id: `local-person-${Date.now()}`, full_name: name, company: form.counterparty_company || null, role: form.counterparty_role || null }
        setPeople(prev => [local, ...prev])
        pickPerson(local)
        return
      }
      const { data, error } = await supabase.from('people').insert({
        full_name: name,
        company:   form.counterparty_company || null,
        role:      form.counterparty_role    || null
      }).select().single()
      if (error) throw error
      setPeople(prev => [data, ...prev])
      pickPerson(data)
      toast.success(`${name} added to People`)
    } catch (err) {
      toast.error(err?.message || 'Could not create person')
    } finally {
      setCreatingPerson(false)
    }
  }

  function submit(e) {
    e.preventDefault()
    if (!form.counterparty_name.trim()) return
    const payload = {
      interaction_purpose: form.interaction_purpose,
      type: form.type,
      person_id: form.person_id || null,
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

        {/* Person picker — typed search → dropdown → Create Person fallback */}
        <div className="rounded-xl border border-valence-border bg-valence-surface p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="vl-label inline-flex items-center gap-1.5"><UserCircle className="h-3.5 w-3.5 text-valence-blue" /> Counterparty</label>
            {form.person_id && (
              <button type="button" onClick={clearPerson} className="text-[11px] font-semibold text-valence-muted hover:text-valence-danger">Unlink person</button>
            )}
          </div>
          {form.person_id ? (
            <div className="rounded-lg border border-valence-blue/30 bg-white px-3 py-2.5 text-sm">
              <p className="font-semibold text-valence-text">{form.counterparty_name}</p>
              <p className="mt-0.5 text-[11px] text-valence-muted">{[form.counterparty_role, form.counterparty_company].filter(Boolean).join(' · ') || '—'}</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-valence-blue">Linked to People</p>
            </div>
          ) : (
            <div className="relative">
              <input
                className="vl-input bg-white"
                value={personQuery}
                onChange={e => { setPersonQuery(e.target.value); update({ counterparty_name: e.target.value }) }}
                placeholder="Search People CRM, or type a new name to add"
              />
              {filteredPeople.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-valence-border bg-white shadow-valence">
                  {filteredPeople.map(p => (
                    <li key={p.id}>
                      <button type="button" onClick={() => pickPerson(p)} className="block w-full px-3 py-2 text-left hover:bg-valence-blue-soft">
                        <p className="text-sm font-semibold text-valence-text">{p.full_name}</p>
                        <p className="text-[11px] text-valence-muted">{[p.role, p.company].filter(Boolean).join(' · ') || '—'}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {personQuery && filteredPeople.length === 0 && (
                <div className="mt-2 flex items-center justify-between rounded-lg border border-dashed border-valence-border bg-white px-3 py-2 text-xs text-valence-muted">
                  <span>No match for "{personQuery}".</span>
                  <button type="button" disabled={creatingPerson} onClick={createPersonInline} className="vl-btn-ghost text-[11px]">
                    <Plus className="h-3 w-3" /> {creatingPerson ? 'Adding…' : 'Create Person'}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="vl-label">Company</label>
              <input className="vl-input mt-1.5 bg-white" value={form.counterparty_company} onChange={e => update({ counterparty_company: e.target.value })} placeholder="Nimbus Health" />
            </div>
            <div>
              <label className="vl-label">Role</label>
              <input className="vl-input mt-1.5 bg-white" value={form.counterparty_role} onChange={e => update({ counterparty_role: e.target.value })} placeholder="CEO" />
            </div>
          </div>
          <div>
            <label className="vl-label">Lead owner</label>
            <input className="vl-input mt-1.5 bg-white" value={form.lead_owner} onChange={e => update({ lead_owner: e.target.value })} placeholder="Neha Jain" />
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
    deal_id: row.deal_id || '',
    person_id: row.person_id || ''
  }
}
