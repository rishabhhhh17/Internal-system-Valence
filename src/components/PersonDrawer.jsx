import { useEffect, useMemo, useState } from 'react'
import { Mail, Phone, Linkedin, MessageSquare, MapPin, Building2, Briefcase, Sparkles, ArrowUpRight, Hash } from 'lucide-react'
import Drawer from './Drawer.jsx'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { TAG_SUGGESTIONS } from '../lib/people.js'
import { Link } from 'react-router-dom'
import EntityMentions from './EntityMentions.jsx'
import WikilinkTextarea from './WikilinkTextarea.jsx'
import WikilinkText from './WikilinkText.jsx'

const TABS = [
  { id: 'overview',    label: 'Overview' },
  { id: 'interactions',label: 'Interactions' },
  { id: 'deals',       label: 'Deals' },
  { id: 'notes',       label: 'Notes' },
  { id: 'files',       label: 'Files' }
]

const BLANK = {
  full_name: '', role: '', company: '', email: '', phone: '', linkedin_url: '', whatsapp: '',
  city: '', country: '',
  how_to_talk: '', relationship_history: '', what_they_care_about: '',
  favours_bank: '', things_to_avoid: '', mutuals: '',
  tags: '', last_touched_at: '', fund_id: ''
}

export default function PersonDrawer({ open, onClose, existing, onSubmit }) {
  const [tab, setTab] = useState('overview')
  const [form, setForm] = useState(BLANK)
  const [funds, setFunds] = useState([])
  const [interactions, setInteractions] = useState([])
  const [deals, setDeals] = useState([])

  useEffect(() => {
    if (!open) return
    setTab('overview')
    setForm(existing ? { ...BLANK, ...stringify(existing) } : BLANK)
  }, [open, existing])

  // Reference data — funds for the dropdown.
  useEffect(() => {
    if (!open || !isSupabaseConfigured) return
    ;(async () => {
      const { data } = await supabase.from('funds').select('id, name').order('name')
      setFunds(data || [])
    })()
  }, [open])

  // When viewing an existing person, pull related interactions + deals.
  useEffect(() => {
    if (!open || !existing?.id || !isSupabaseConfigured) {
      setInteractions([]); setDeals([]); return
    }
    ;(async () => {
      const [i, d] = await Promise.all([
        supabase.from('interactions').select('*').eq('person_id', existing.id).order('created_at', { ascending: false }),
        // Deals where this person's email matches a counterparty (loose link until contacts.person_id exists).
        existing.email
          ? supabase.from('contacts').select('deal_id, deals(id, client_name, stage)').eq('email', existing.email)
          : Promise.resolve({ data: [] })
      ])
      setInteractions(i.data || [])
      setDeals((d.data || []).map(c => c.deals).filter(Boolean))
    })()
  }, [open, existing?.id, existing?.email])

  function update(patch) { setForm(f => ({ ...f, ...patch })) }

  function submit(e) {
    e.preventDefault()
    if (!form.full_name.trim()) return
    const payload = {
      full_name: form.full_name.trim(),
      role: txt(form.role),
      company: txt(form.company),
      fund_id: form.fund_id || null,
      email: txt(form.email),
      phone: txt(form.phone),
      linkedin_url: txt(form.linkedin_url),
      whatsapp: txt(form.whatsapp),
      city: txt(form.city),
      country: txt(form.country),
      how_to_talk: txt(form.how_to_talk),
      relationship_history: txt(form.relationship_history),
      what_they_care_about: txt(form.what_they_care_about),
      favours_bank: txt(form.favours_bank),
      things_to_avoid: txt(form.things_to_avoid),
      mutuals: txt(form.mutuals),
      tags: parseTags(form.tags),
      last_touched_at: form.last_touched_at || null
    }
    onSubmit?.(payload, existing?.id)
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={existing ? existing.full_name : 'Add person'}
      footer={
        tab === 'overview' ? (
          <div className="flex items-center justify-end gap-3">
            <button type="button" onClick={onClose} className="vl-btn-secondary">Cancel</button>
            <button type="submit" form="person-form" className="vl-btn-primary">{existing ? 'Save changes' : 'Save person'}</button>
          </div>
        ) : null
      }
    >
      {existing && (
        <div className="mb-5 -mx-1 flex items-center gap-1 border-b border-valence-border overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative px-3 py-2 text-xs font-semibold transition shrink-0 ${tab === t.id ? 'text-valence-text' : 'text-valence-muted hover:text-valence-text'}`}
            >
              {t.label}
              {tab === t.id && <span className="absolute bottom-[-1px] left-2 right-2 h-0.5 rounded-full bg-valence-blue" />}
            </button>
          ))}
        </div>
      )}

      {tab === 'overview' && (
        <form id="person-form" onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name *">
              <input className="vl-input" required value={form.full_name} onChange={e => update({ full_name: e.target.value })} placeholder="Anand Iyer" />
            </Field>
            <Field label="Role">
              <input className="vl-input" value={form.role} onChange={e => update({ role: e.target.value })} placeholder="Principal" />
            </Field>
            <Field label="Company">
              <input className="vl-input" value={form.company} onChange={e => update({ company: e.target.value })} placeholder="Peak XV Partners" />
            </Field>
            <Field label="Fund (if applicable)">
              <select className="vl-input" value={form.fund_id || ''} onChange={e => update({ fund_id: e.target.value })}>
                <option value="">— None —</option>
                {funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </Field>
            <Field label="City"><input className="vl-input" value={form.city} onChange={e => update({ city: e.target.value })} placeholder="Bengaluru" /></Field>
            <Field label="Country"><input className="vl-input" value={form.country} onChange={e => update({ country: e.target.value })} placeholder="India" /></Field>
            <Field label="Email"><input className="vl-input" value={form.email} onChange={e => update({ email: e.target.value })} placeholder="anand@peakxv.com" /></Field>
            <Field label="Phone"><input className="vl-input" value={form.phone} onChange={e => update({ phone: e.target.value })} placeholder="+91 98201 …" /></Field>
            <Field label="LinkedIn"><input className="vl-input" value={form.linkedin_url} onChange={e => update({ linkedin_url: e.target.value })} placeholder="https://linkedin.com/in/…" /></Field>
            <Field label="WhatsApp"><input className="vl-input" value={form.whatsapp} onChange={e => update({ whatsapp: e.target.value })} placeholder="+91 98201 …" /></Field>
            <Field label="Last touched"><input type="date" className="vl-input" value={form.last_touched_at} onChange={e => update({ last_touched_at: e.target.value })} /></Field>
            <Field label="Tags (comma-separated)"><input className="vl-input" value={form.tags} onChange={e => update({ tags: e.target.value })} placeholder={TAG_SUGGESTIONS.slice(0, 4).join(', ')} /></Field>
          </div>

          {/* Persona section */}
          <div className="rounded-xl border border-valence-blue/20 bg-valence-blue-soft/20 p-4 space-y-3">
            <p className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Sparkles className="h-3 w-3 text-valence-blue" /> Persona — visible to everyone on the team</p>
            <PersonaField label="How to talk to them" value={form.how_to_talk} onChange={v => update({ how_to_talk: v })} placeholder={`e.g. "Direct, asks for the cheque size in 30 seconds. Skip preamble."`} />
            <PersonaField label="Relationship history"  value={form.relationship_history} onChange={v => update({ relationship_history: v })} placeholder={`e.g. "Met at IVCA 2019 via Trishant. Closed 2 deals together."`} />
            <PersonaField label="What they care about"  value={form.what_they_care_about} onChange={v => update({ what_they_care_about: v })} placeholder={`e.g. "Founder optionality. Path-to-IPO clarity."`} />
            <PersonaField label="Favours bank"          value={form.favours_bank} onChange={v => update({ favours_bank: v })} placeholder={`e.g. "Will move fast for us. 2 of ~3 favours used."`} />
            <PersonaField label="Things to avoid"       value={form.things_to_avoid} onChange={v => update({ things_to_avoid: v })} placeholder={`e.g. "Don't pitch on Mondays. Treats them as planning days."`} />
            <PersonaField label="Mutuals"               value={form.mutuals} onChange={v => update({ mutuals: v })} placeholder={`e.g. "Close to Trishant. Distant from Manav."`} />
          </div>
        </form>
      )}

      {tab === 'interactions' && existing && (
        <RelatedList
          items={interactions}
          empty="No interactions logged with this person yet."
          render={i => (
            <div>
              <p className="text-sm font-semibold text-valence-text">{i.type?.replace(/_/g, ' ') || 'Interaction'}</p>
              <p className="text-[11px] text-valence-muted">{i.outcome?.replace(/_/g, ' ')} · {i.created_at?.slice(0, 10)}</p>
              {i.notes && <p className="mt-1 text-[12px] text-valence-muted leading-relaxed line-clamp-2"><WikilinkText>{i.notes}</WikilinkText></p>}
            </div>
          )}
        />
      )}

      {tab === 'deals' && existing && (
        <RelatedList
          items={deals}
          empty="No deals link to this person yet. Counterparty link by email; once Phase 2 wires contacts.person_id this list expands."
          render={d => (
            <Link to={`/deals?open=${d.id}`} className="block">
              <p className="text-sm font-semibold text-valence-text">{d.client_name}</p>
              <p className="text-[11px] text-valence-muted">{d.stage}</p>
            </Link>
          )}
        />
      )}

      {tab === 'notes' && existing && (
        <EntityMentions entityType="person" entityId={existing.id} entityName={existing.full_name} />
      )}

      {tab === 'files' && existing && (
        <div className="rounded-lg border border-dashed border-valence-border bg-valence-surface px-5 py-8 text-center text-sm text-valence-muted">
          Files attached directly to this person — Phase 2 with the KB folder hierarchy.
        </div>
      )}

      {existing && tab === 'overview' && (
        <div className="mt-6 grid gap-2">
          {existing.email    && <Linklet icon={Mail}     href={`mailto:${existing.email}`}        label={existing.email} />}
          {existing.phone    && <Linklet icon={Phone}    href={`tel:${existing.phone.replace(/\s+/g,'')}`} label={existing.phone} />}
          {existing.linkedin_url && <Linklet icon={Linkedin} href={existing.linkedin_url} label="LinkedIn" external />}
          {existing.whatsapp && <Linklet icon={MessageSquare} href={`https://wa.me/${existing.whatsapp.replace(/[^0-9]/g,'')}`} label="WhatsApp" external />}
        </div>
      )}
    </Drawer>
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

function PersonaField({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="vl-label">{label}</label>
      <WikilinkTextarea
        className="vl-input min-h-[64px] mt-1.5 leading-relaxed bg-white"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
    </div>
  )
}

function RelatedList({ items, empty, render }) {
  if (!items || items.length === 0) {
    return <div className="rounded-lg border border-dashed border-valence-border bg-valence-surface px-5 py-8 text-center text-sm text-valence-muted">{empty}</div>
  }
  return (
    <ul className="divide-y divide-valence-border/60 rounded-xl border border-valence-border bg-white">
      {items.map((it, i) => (
        <li key={it.id || i} className="px-4 py-3">{render(it)}</li>
      ))}
    </ul>
  )
}

function Linklet({ icon: Icon, href, label, external = false }) {
  return (
    <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}
      className="inline-flex items-center gap-2 rounded-lg border border-valence-border bg-valence-surface px-3 py-2 text-xs font-semibold text-valence-text hover:border-valence-blue/40 transition">
      <Icon className="h-3.5 w-3.5 text-valence-blue" /> {label}
      {external && <ArrowUpRight className="ml-auto h-3 w-3 text-valence-subtle" />}
    </a>
  )
}

function txt(v) { return (v || '').toString().trim() || null }
function parseTags(v) { return (v || '').split(',').map(s => s.trim()).filter(Boolean) }
function stringify(p) {
  return {
    ...p,
    tags: Array.isArray(p.tags) ? p.tags.join(', ') : (p.tags || ''),
    last_touched_at: p.last_touched_at ? String(p.last_touched_at).slice(0, 10) : '',
    fund_id: p.fund_id || ''
  }
}
