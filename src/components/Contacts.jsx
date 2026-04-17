import { useEffect, useState } from 'react'
import { Plus, Mail, Phone, Trash2, User2, Building2 } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { logActivity } from '../lib/activity.js'
import { useToast } from './Toast.jsx'
import { useConfirm } from './ConfirmDialog.jsx'

const ROLES = ['Founder / CEO','CFO','Fund Partner','Investor','Legal Counsel','Co-advisor','Strategic Buyer','Board Member','Observer','Other']

export default function Contacts({ dealId, onOpenComposer }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding]   = useState(false)

  useEffect(() => {
    if (!dealId) return
    if (!isSupabaseConfigured) { setContacts([]); setLoading(false); return }
    load()
  }, [dealId])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('contacts').select('*').eq('deal_id', dealId).order('created_at', { ascending: true })
    if (error) toast.error(error.message)
    setContacts(data || [])
    setLoading(false)
  }

  async function add(form) {
    if (!isSupabaseConfigured) {
      setContacts(prev => [...prev, { id: `local-${Date.now()}`, deal_id: dealId, ...form }])
      setAdding(false); return
    }
    const { data, error } = await supabase.from('contacts').insert({ deal_id: dealId, ...form }).select().single()
    if (error) return toast.error(error.message)
    await logActivity({ dealId, kind: 'contact_added', body: `${form.name}${form.company ? ' (' + form.company + ')' : ''}` })
    setContacts(prev => [...prev, data])
    setAdding(false)
    toast.success(`Added ${form.name}.`)
  }

  async function remove(c) {
    const ok = await confirm({ title: 'Remove counterparty?', body: `${c.name} will be detached from this deal.`, destructive: true, confirmLabel: 'Remove' })
    if (!ok) return
    if (!isSupabaseConfigured) {
      setContacts(prev => prev.filter(x => x.id !== c.id)); return
    }
    const { error } = await supabase.from('contacts').delete().eq('id', c.id)
    if (error) return toast.error(error.message)
    setContacts(prev => prev.filter(x => x.id !== c.id))
    toast.success(`${c.name} removed.`)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-valence-muted">
          Everyone on the other side of this mandate.
        </p>
        <button onClick={() => setAdding(true)} className="vl-btn-ghost">
          <Plus className="h-3.5 w-3.5" /> Add counterparty
        </button>
      </div>

      {adding && <AddForm onCancel={() => setAdding(false)} onSubmit={add} />}

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-white/[0.03] animate-pulse" />)}</div>
      ) : contacts.length === 0 && !adding ? (
        <div className="rounded-lg border border-valence-border bg-white/[0.02] px-5 py-6 text-center">
          <User2 className="mx-auto h-4 w-4 text-valence-subtle" />
          <p className="mt-2 text-sm text-valence-muted">No counterparties yet. Add founders, investors, or co-advisors.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {contacts.map(c => (
            <li key={c.id} className="group rounded-lg border border-valence-border bg-white/[0.02] px-4 py-3 hover:bg-white/[0.04] transition">
              <div className="flex items-start gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-valence-blue to-[#1a85ff] text-xs font-semibold text-white ring-1 ring-valence-border-strong shrink-0">
                  {initials(c.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-white">{c.name}</p>
                    {c.role && <span className="vl-chip-blue whitespace-nowrap">{c.role}</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-valence-muted">
                    {c.company && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{c.company}</span>}
                    {c.email   && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-valence-blue"><Mail className="h-3 w-3" />{c.email}</a>}
                    {c.phone   && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
                  </div>
                  {c.notes && <p className="mt-1.5 text-[11px] leading-relaxed text-valence-muted">{c.notes}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => onOpenComposer?.(c)} className="vl-btn-ghost" aria-label="Draft email">
                    <Mail className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => remove(c)} className="vl-btn-ghost text-valence-subtle hover:text-valence-danger" aria-label="Remove">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function AddForm({ onSubmit, onCancel }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', role: 'Founder / CEO', notes: '' })
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (form.name.trim()) onSubmit(form) }} className="space-y-3 rounded-lg border border-valence-border bg-white/[0.03] p-4">
      <div className="grid grid-cols-2 gap-3">
        <input className="vl-input" value={form.name}    onChange={e => set('name', e.target.value)} placeholder="Full name" required autoFocus />
        <select className="vl-input" value={form.role}   onChange={e => set('role', e.target.value)}>
          {ROLES.map(r => <option key={r} className="bg-valence-surface" value={r}>{r}</option>)}
        </select>
        <input className="vl-input" value={form.company} onChange={e => set('company', e.target.value)} placeholder="Company" />
        <input className="vl-input" value={form.email}   onChange={e => set('email', e.target.value)} placeholder="Email" type="email" />
        <input className="vl-input col-span-2" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="Phone (optional)" />
      </div>
      <textarea className="vl-input min-h-[60px]" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Quick note on this person (optional)" />
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className="vl-btn-secondary">Cancel</button>
        <button type="submit" className="vl-btn-primary">Add</button>
      </div>
    </form>
  )
}

function initials(name) {
  return (name || '').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
}
