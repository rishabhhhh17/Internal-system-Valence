import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Globe, Mail, Phone, ExternalLink, Sparkles, UserCircle } from 'lucide-react'
import Drawer from './Drawer.jsx'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { FUND_TYPES, WARMTH_LEVELS, warmthTone, fundTypeLabel } from '../lib/funds.js'
import { DEMO_PEOPLE } from '../lib/people.js'
import EntityMentions from './EntityMentions.jsx'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'people',   label: 'People' },
  { id: 'deals',    label: 'Deals' },
  { id: 'mentions', label: 'Mentions' },
  { id: 'notes',    label: 'Notes' }
]

const BLANK = {
  name: '', fund_type: 'VC',
  hq_city: '', hq_country: '',
  aum_usd_m: '',
  check_size_min_usd_m: '', check_size_max_usd_m: '',
  sectors: '', stages: '', geographies: '',
  website: '',
  warmth: 'cold',
  last_touched_at: '',
  notes: ''
}

export default function FundDrawer({ open, onClose, existing, onSubmit }) {
  const [tab, setTab] = useState('overview')
  const [form, setForm] = useState(BLANK)
  const [contacts, setContacts] = useState([])
  const [pings, setPings] = useState([])
  const [peopleAtFund, setPeopleAtFund] = useState([])

  useEffect(() => {
    if (!open) return
    setTab('overview')
    setForm(existing ? { ...BLANK, ...stringifyArrays(existing) } : BLANK)
  }, [open, existing])

  useEffect(() => {
    if (!open || !existing?.id) return
    if (!isSupabaseConfigured) {
      // demo fallback — match People CRM rows whose company === fund.name
      setPeopleAtFund(DEMO_PEOPLE.filter(p => p.company === existing.name))
      return
    }
    ;(async () => {
      const [c, p, pp] = await Promise.all([
        supabase.from('fund_contacts').select('*').eq('fund_id', existing.id).order('created_at', { ascending: false }),
        supabase.from('deal_fund_pings').select('*, deals(client_name, stage)').eq('fund_id', existing.id).order('pinged_at', { ascending: false }),
        supabase.from('people').select('*').eq('fund_id', existing.id).order('full_name')
      ])
      setContacts(c.data || [])
      setPings(p.data || [])
      setPeopleAtFund(pp.data || [])
    })()
  }, [open, existing?.id, existing?.name])

  function update(patch) { setForm(f => ({ ...f, ...patch })) }

  function submit(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    const payload = {
      name: form.name.trim(),
      fund_type: form.fund_type,
      hq_city: form.hq_city.trim() || null,
      hq_country: form.hq_country.trim() || null,
      aum_usd_m: parseNumber(form.aum_usd_m),
      check_size_min_usd_m: parseNumber(form.check_size_min_usd_m),
      check_size_max_usd_m: parseNumber(form.check_size_max_usd_m),
      sectors: parseList(form.sectors),
      stages: parseList(form.stages),
      geographies: parseList(form.geographies),
      website: form.website.trim() || null,
      warmth: form.warmth,
      last_touched_at: form.last_touched_at || null,
      notes: form.notes.trim() || null
    }
    onSubmit?.(payload, existing?.id)
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={existing ? existing.name : 'New fund'}
      footer={
        tab === 'overview' || tab === 'notes' ? (
          <div className="flex items-center justify-end gap-3">
            <button type="button" onClick={onClose} className="vl-btn-secondary">Cancel</button>
            <button type="submit" form="fund-form" className="vl-btn-primary">{existing ? 'Save changes' : 'Save fund'}</button>
          </div>
        ) : null
      }
    >
      {existing && (
        <div className="mb-5 -mx-1 flex items-center gap-1 border-b border-valence-border">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative px-3 py-2 text-xs font-semibold transition ${tab === t.id ? 'text-valence-text' : 'text-valence-muted hover:text-valence-text'}`}
            >
              {t.label}
              {tab === t.id && <span className="absolute bottom-[-1px] left-2 right-2 h-0.5 rounded-full bg-valence-blue" />}
            </button>
          ))}
        </div>
      )}

      {tab === 'overview' && (
        <form id="fund-form" onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fund name *">
              <input className="vl-input" required value={form.name} onChange={e => update({ name: e.target.value })} placeholder="Peak XV Partners" />
            </Field>
            <Field label="Type">
              <select className="vl-input" value={form.fund_type} onChange={e => update({ fund_type: e.target.value })}>
                {FUND_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="HQ city"><input className="vl-input" value={form.hq_city} onChange={e => update({ hq_city: e.target.value })} placeholder="Bengaluru" /></Field>
            <Field label="HQ country"><input className="vl-input" value={form.hq_country} onChange={e => update({ hq_country: e.target.value })} placeholder="India" /></Field>
            <Field label="AUM (USD M)"><input type="number" className="vl-input" value={form.aum_usd_m} onChange={e => update({ aum_usd_m: e.target.value })} placeholder="9000" /></Field>
            <Field label="Warmth">
              <select className="vl-input" value={form.warmth} onChange={e => update({ warmth: e.target.value })}>
                {WARMTH_LEVELS.map(w => <option key={w} value={w} className="capitalize">{w}</option>)}
              </select>
            </Field>
            <Field label="Cheque size min ($M)"><input type="number" className="vl-input" value={form.check_size_min_usd_m} onChange={e => update({ check_size_min_usd_m: e.target.value })} placeholder="5" /></Field>
            <Field label="Cheque size max ($M)"><input type="number" className="vl-input" value={form.check_size_max_usd_m} onChange={e => update({ check_size_max_usd_m: e.target.value })} placeholder="100" /></Field>
            <Field label="Last touched"><input type="date" className="vl-input" value={form.last_touched_at} onChange={e => update({ last_touched_at: e.target.value })} /></Field>
            <Field label="Website"><input className="vl-input" value={form.website} onChange={e => update({ website: e.target.value })} placeholder="https://…" /></Field>
          </div>

          <div className="grid gap-4">
            <Field label="Sectors (comma-separated)"><input className="vl-input" value={form.sectors} onChange={e => update({ sectors: e.target.value })} placeholder="Fintech, Healthcare, Consumer" /></Field>
            <Field label="Stages (comma-separated)"><input className="vl-input" value={form.stages} onChange={e => update({ stages: e.target.value })} placeholder="Mandate, Marketing, Diligence" /></Field>
            <Field label="Geographies (comma-separated)"><input className="vl-input" value={form.geographies} onChange={e => update({ geographies: e.target.value })} placeholder="India, SE Asia" /></Field>
          </div>
        </form>
      )}

      {tab === 'contacts' && existing && <ContactsTab fundId={existing.id} contacts={contacts} setContacts={setContacts} />}

      {tab === 'people' && existing && (
        peopleAtFund.length === 0 ? (
          <div className="rounded-lg border border-dashed border-valence-border bg-valence-surface px-5 py-8 text-center text-sm text-valence-muted">
            No People CRM rows linked to this fund yet. Add a person and set their Fund to <b>{existing.name}</b> to see them here.
          </div>
        ) : (
          <ul className="divide-y divide-valence-border/60 rounded-xl border border-valence-border bg-white">
            {peopleAtFund.map(p => (
              <li key={p.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link to="/people" className="text-sm font-semibold text-valence-text hover:text-valence-blue inline-flex items-center gap-1.5">
                      <UserCircle className="h-3.5 w-3.5 text-valence-blue" /> {p.full_name}
                    </Link>
                    <p className="mt-0.5 text-[11px] text-valence-muted">{[p.role, [p.city, p.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || '—'}</p>
                  </div>
                  {p.tags?.[0] && <span className="text-[10px] font-semibold text-valence-muted">{p.tags[0]}</span>}
                </div>
                {p.how_to_talk && <p className="mt-1.5 text-[11px] italic text-valence-muted line-clamp-2">"{p.how_to_talk}"</p>}
              </li>
            ))}
          </ul>
        )
      )}

      {tab === 'deals' && existing && (
        <div className="space-y-2">
          {pings.length === 0 ? (
            <div className="rounded-lg border border-dashed border-valence-border bg-valence-surface px-5 py-6 text-center text-sm text-valence-muted">No deals shortlisted to this fund yet.</div>
          ) : pings.map(p => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-valence-border bg-white px-3 py-2 text-sm">
              <div>
                <p className="font-semibold text-valence-text">{p.deals?.client_name || 'Untitled'}</p>
                <p className="text-[11px] text-valence-muted">{p.deals?.stage || '—'} · {p.status}</p>
              </div>
              <span className="text-[11px] text-valence-subtle">{p.pinged_at ? new Date(p.pinged_at).toLocaleDateString() : ''}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'mentions' && existing && (
        <EntityMentions entityType="fund" entityId={existing.id} entityName={existing.name} />
      )}

      {tab === 'notes' && (
        <form id="fund-form" onSubmit={submit} className="space-y-4">
          <Field label="Internal notes">
            <textarea
              className="vl-input min-h-[260px] leading-relaxed"
              value={form.notes}
              onChange={e => update({ notes: e.target.value })}
              placeholder="What we know — thesis, recent investments, partner preferences, who covers them on the team…"
            />
          </Field>
        </form>
      )}

      {existing?.website && tab === 'overview' && (
        <a href={existing.website} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-[11px] font-semibold text-valence-blue hover:text-valence-blue-hover">
          <Globe className="h-3 w-3" /> {existing.website} <ExternalLink className="h-3 w-3" />
        </a>
      )}

      {existing && tab === 'overview' && (
        <div className="mt-6 rounded-lg border border-valence-border bg-valence-surface px-4 py-3 text-[11px] text-valence-muted inline-flex items-start gap-2">
          <Sparkles className="h-3 w-3 mt-0.5 text-valence-blue" />
          <span>Use the Funds tab inside any deal drawer to shortlist this fund for a live mandate.</span>
        </div>
      )}
    </Drawer>
  )
}

function ContactsTab({ fundId, contacts, setContacts }) {
  const [draft, setDraft] = useState({ name: '', role: '', email: '', phone: '', notes: '' })
  const [busy, setBusy] = useState(false)

  async function add(e) {
    e.preventDefault()
    if (!draft.name.trim()) return
    setBusy(true)
    if (!isSupabaseConfigured) {
      setContacts(prev => [{ id: `local-${Date.now()}`, ...draft }, ...prev])
      setDraft({ name: '', role: '', email: '', phone: '', notes: '' })
      setBusy(false); return
    }
    const { data, error } = await supabase.from('fund_contacts').insert({ fund_id: fundId, ...draft }).select().single()
    setBusy(false)
    if (error) return
    setContacts(prev => [data, ...prev])
    setDraft({ name: '', role: '', email: '', phone: '', notes: '' })
  }

  return (
    <div className="space-y-5">
      <form onSubmit={add} className="space-y-3 rounded-xl border border-valence-border bg-valence-surface p-4">
        <p className="vl-eyebrow-ink">Add contact</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <input className="vl-input" required value={draft.name}  onChange={e => setDraft({ ...draft, name: e.target.value })}  placeholder="Name *" />
          <input className="vl-input" value={draft.role}  onChange={e => setDraft({ ...draft, role: e.target.value })}  placeholder="Role" />
          <input className="vl-input" value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} placeholder="Email" />
          <input className="vl-input" value={draft.phone} onChange={e => setDraft({ ...draft, phone: e.target.value })} placeholder="Phone" />
        </div>
        <textarea className="vl-input min-h-[64px]" value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} placeholder="Notes (last contact, coverage area…)"></textarea>
        <div className="flex justify-end">
          <button type="submit" disabled={busy} className="vl-btn-primary text-xs">Add contact</button>
        </div>
      </form>

      {contacts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-valence-border bg-valence-surface px-5 py-6 text-center text-sm text-valence-muted">No contacts on file yet.</div>
      ) : (
        <ul className="divide-y divide-valence-border/60 rounded-xl border border-valence-border bg-white">
          {contacts.map(c => (
            <li key={c.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-valence-text">{c.name}</p>
                {c.role && <span className="text-[11px] text-valence-muted">{c.role}</span>}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-valence-muted">
                {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-valence-blue"><Mail className="h-3 w-3" /> {c.email}</a>}
                {c.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {c.phone}</span>}
              </div>
              {c.notes && <p className="mt-1 text-[11px] text-valence-muted leading-relaxed">{c.notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="vl-label">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

function parseNumber(v) { if (v === '' || v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null }
function parseList(v) { return (v || '').split(',').map(s => s.trim()).filter(Boolean) }
function stringifyArrays(row) {
  return {
    ...row,
    sectors: Array.isArray(row.sectors) ? row.sectors.join(', ') : (row.sectors || ''),
    stages: Array.isArray(row.stages) ? row.stages.join(', ') : (row.stages || ''),
    geographies: Array.isArray(row.geographies) ? row.geographies.join(', ') : (row.geographies || ''),
    aum_usd_m: row.aum_usd_m ?? '',
    check_size_min_usd_m: row.check_size_min_usd_m ?? '',
    check_size_max_usd_m: row.check_size_max_usd_m ?? '',
    last_touched_at: row.last_touched_at ? String(row.last_touched_at).slice(0, 10) : '',
    notes: row.notes ?? ''
  }
}
