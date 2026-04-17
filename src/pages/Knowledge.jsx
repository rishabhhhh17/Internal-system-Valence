import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { Plus, Search, BookOpen, Tag as TagIcon, Hash, Trash2, Table as TableIcon, FileText } from 'lucide-react'
import { supabase, isSupabaseConfigured, subscribeTable } from '../lib/supabase.js'
import ConfigBanner from '../components/ConfigBanner.jsx'
import Modal from '../components/Modal.jsx'
import Drawer from '../components/Drawer.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { useToast } from '../components/Toast.jsx'
import { useConfirm } from '../components/ConfirmDialog.jsx'

const DOC_DEMO = [
  { id: 'k1', title: 'M&A Process Playbook', content: 'End-to-end M&A workflow used across Valence engagements: mandate, teaser, NDA, IM, management presentations, LOI, diligence, SPA, close.', tags: ['playbook','M&A','process'], sector: 'General', created_at: new Date().toISOString() },
  { id: 'k2', title: 'ECM Roadshow Framework', content: 'Standard roadshow cadence for IPO/FPO mandates: anchor meetings, institutional one-on-ones, retail syndicate alignment.', tags: ['ECM','roadshow','IPO'], sector: 'Capital Markets', created_at: new Date().toISOString() },
  { id: 'k3', title: 'Healthcare Sector Memo — Q1', content: 'Thesis: consolidation wave across hospital chains + diagnostics.', tags: ['thesis','healthcare'], sector: 'Healthcare', created_at: new Date().toISOString() },
  { id: 'k4', title: 'BFSI Deal Note Template', content: 'Standard internal note structure for BFSI mandates.', tags: ['template','BFSI'], sector: 'BFSI', created_at: new Date().toISOString() },
  { id: 'k5', title: 'NDA — Sell-side Standard', content: 'Valence standard sell-side NDA. Mutual, 2-year tail.', tags: ['legal','template','NDA'], sector: 'Legal', created_at: new Date().toISOString() },
  { id: 'k6', title: 'DCM Pricing Reference', content: 'Reference grid for recent INR corporate bond issuances by rating band.', tags: ['DCM','pricing','reference'], sector: 'Capital Markets', created_at: new Date().toISOString() }
]

const COMPS_DEMO = [
  { id: 'c1', target: 'CareHub Diagnostics',   acquirer: 'Asian Hospital Group',   year: 2024, sector: 'Healthcare',     deal_type: 'M&A',   ev_usd_m: 420,  revenue_multiple: 3.8, ebitda_multiple: 14.2, notes: 'Strategic roll-up. 65-clinic footprint.' },
  { id: 'c2', target: 'NorthStar Fintech',     acquirer: 'Everlast PE',             year: 2024, sector: 'Fintech',        deal_type: 'PE/VC', ev_usd_m: 680,  revenue_multiple: 8.5, ebitda_multiple: null,  notes: 'Series D at $680M EV.' },
  { id: 'c3', target: 'Greenline Power',       acquirer: 'Sovereign Infra Fund',    year: 2023, sector: 'Energy',         deal_type: 'M&A',   ev_usd_m: 1250, revenue_multiple: 2.1, ebitda_multiple: 11.4, notes: '60% stake. Regulated utility.' },
  { id: 'c4', target: 'LearnKart',             acquirer: 'Global EdTech PLC',       year: 2024, sector: 'EdTech',         deal_type: 'M&A',   ev_usd_m: 290,  revenue_multiple: 6.2, ebitda_multiple: null,  notes: 'Cross-border India + SEA.' },
  { id: 'c5', target: 'Maple Consumer Brands', acquirer: 'Regional Strategics Ltd', year: 2023, sector: 'Consumer',       deal_type: 'M&A',   ev_usd_m: 185,  revenue_multiple: 2.4, ebitda_multiple: 12.8, notes: 'Premium staples.' },
  { id: 'c6', target: 'Artemis Infra Bonds',   acquirer: null,                      year: 2024, sector: 'Infrastructure', deal_type: 'DCM',   ev_usd_m: 500,  revenue_multiple: null, ebitda_multiple: null, notes: '10Y INR bonds. 7.85% coupon. AAA.' }
]

export default function Knowledge() {
  const [tab, setTab] = useState('docs') // 'docs' | 'comps'
  return (
    <div className="space-y-6">
      <ConfigBanner />

      <div className="flex items-center gap-1 rounded-lg border border-valence-border bg-white/[0.02] p-1 w-fit">
        <TabButton active={tab === 'docs'}  onClick={() => setTab('docs')}  icon={BookOpen}>Documents</TabButton>
        <TabButton active={tab === 'comps'} onClick={() => setTab('comps')} icon={TableIcon}>Precedent Comps</TabButton>
      </div>

      {tab === 'docs' ? <Documents /> : <Comps />}
    </div>
  )
}

function TabButton({ active, onClick, children, icon: Icon }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
        active ? 'bg-valence-blue-soft text-white' : 'text-valence-muted hover:text-white'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  )
}

// ============ DOCUMENTS ============
function Documents() {
  const toast = useToast()
  const confirm = useConfirm()
  const [params, setParams] = useSearchParams()
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [sector, setSector] = useState('All')
  const [tag, setTag] = useState('All')
  const [open, setOpen] = useState(null)
  const [modal, setModal] = useState(false)

  useEffect(() => { load() }, [])
  useEffect(() => {
    if (!isSupabaseConfigured) return
    return subscribeTable('documents', load)
  }, [])

  // Deep-link from Command Palette: /knowledge?open=<id>
  useEffect(() => {
    const id = params.get('open')
    if (!id || docs.length === 0) return
    const doc = docs.find(d => d.id === id)
    if (doc) {
      setOpen(doc)
      const next = new URLSearchParams(params); next.delete('open'); setParams(next, { replace: true })
    }
  }, [params, docs])

  async function load() {
    setLoading(true)
    if (!isSupabaseConfigured) { setDocs(DOC_DEMO); setLoading(false); return }
    const { data, error } = await supabase.from('documents').select('*').order('created_at', { ascending: false })
    if (error) toast.error(error.message)
    setDocs(data || [])
    setLoading(false)
  }

  const sectors = useMemo(() => Array.from(new Set(docs.map(d => d.sector).filter(Boolean))).sort(), [docs])
  const tags    = useMemo(() => Array.from(new Set(docs.flatMap(d => d.tags || []))).sort(), [docs])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return docs.filter(d =>
      (sector === 'All' || d.sector === sector) &&
      (tag === 'All' || (d.tags || []).includes(tag)) &&
      (!needle ||
        d.title.toLowerCase().includes(needle) ||
        d.content.toLowerCase().includes(needle) ||
        (d.tags || []).some(t => t.toLowerCase().includes(needle)))
    )
  }, [docs, q, sector, tag])

  async function saveDoc(payload) {
    if (!isSupabaseConfigured) {
      setDocs(prev => [{ id: `local-${Date.now()}`, created_at: new Date().toISOString(), ...payload }, ...prev])
      setModal(false); toast.success('Document published.'); return
    }
    const { error } = await supabase.from('documents').insert(payload)
    if (error) return toast.error(error.message)
    setModal(false); load()
    toast.success('Document published.')
  }

  async function deleteDoc(doc) {
    const ok = await confirm({ title: 'Delete document?', body: `"${doc.title}" will be removed from the knowledge base.`, destructive: true, confirmLabel: 'Delete' })
    if (!ok) return
    if (!isSupabaseConfigured) {
      setDocs(prev => prev.filter(d => d.id !== doc.id))
    } else {
      const { error } = await supabase.from('documents').delete().eq('id', doc.id)
      if (error) return toast.error(error.message)
      load()
    }
    setOpen(null)
    toast.success('Document deleted.')
  }

  return (
    <div className="space-y-6">
      <div className="vl-card p-5">
        <div className="flex items-center gap-3 rounded-xl border border-valence-border bg-white/[0.03] px-4 py-3 focus-within:border-valence-blue focus-within:ring-2 focus-within:ring-valence-blue-ring transition">
          <Search className="h-4 w-4 text-valence-blue" />
          <input
            value={q} onChange={e => setQ(e.target.value)} autoFocus
            placeholder="Search playbooks, memos, templates — live across every document…"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-valence-subtle outline-none"
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Chip active={sector === 'All'} onClick={() => setSector('All')}>All sectors</Chip>
            {sectors.map(s => <Chip key={s} active={sector === s} onClick={() => setSector(s)}>{s}</Chip>)}
          </div>
          <button onClick={() => setModal(true)} className="vl-btn-primary">
            <Plus className="h-4 w-4" /> New document
          </button>
        </div>

        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-valence-border pt-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-valence-subtle">Tags</span>
            <Chip active={tag === 'All'} onClick={() => setTag('All')} small>All</Chip>
            {tags.map(t => (
              <Chip key={t} active={tag === t} onClick={() => setTag(t)} small>
                <Hash className="h-3 w-3" /> {t}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <GridSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={q ? 'No documents match your search' : 'The knowledge base is empty'}
          description={q ? 'Try different keywords or clear your filters.' : 'Add your first memo, template or playbook.'}
          action={<button onClick={() => setModal(true)} className="vl-btn-primary"><Plus className="h-4 w-4" /> New document</button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(d => (
            <article key={d.id} onClick={() => setOpen(d)} className="vl-card vl-card-hover group cursor-pointer p-5">
              <div className="flex items-center justify-between">
                {d.sector && <span className="vl-chip-blue">{d.sector}</span>}
                <span className="text-[11px] text-valence-subtle">{format(new Date(d.created_at), 'd MMM')}</span>
              </div>
              <h3 className="mt-3 text-base font-semibold leading-snug text-white group-hover:text-valence-blue transition">{d.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-valence-muted line-clamp-4">{d.content}</p>
              {(d.tags || []).length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {(d.tags || []).slice(0, 4).map(t => (
                    <span key={t} className="inline-flex items-center gap-1 rounded-md border border-valence-border bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-medium text-valence-muted">
                      <Hash className="h-2.5 w-2.5" />{t}
                    </span>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <Drawer
        open={Boolean(open)}
        onClose={() => setOpen(null)}
        title={open?.title || ''}
        footer={open && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-valence-muted">Added {format(new Date(open.created_at), 'd MMM yyyy')}</span>
            <button onClick={() => deleteDoc(open)} className="vl-btn-ghost text-valence-danger hover:text-valence-danger">
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        )}
      >
        {open && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              {open.sector && <span className="vl-chip-blue">{open.sector}</span>}
              {(open.tags || []).map(t => <span key={t} className="vl-chip"><Hash className="h-3 w-3" />{t}</span>)}
            </div>
            <div className="whitespace-pre-wrap rounded-lg border border-valence-border bg-white/[0.02] px-4 py-4 text-sm leading-relaxed text-valence-text">
              {open.content}
            </div>
          </div>
        )}
      </Drawer>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="New document"
        description="Write a memo, template, or playbook. It becomes searchable for the whole team instantly."
        size="lg"
      >
        <DocForm onCancel={() => setModal(false)} onSubmit={saveDoc} />
      </Modal>
    </div>
  )
}

// ============ COMPS ============
function Comps() {
  const toast = useToast()
  const confirm = useConfirm()
  const [comps, setComps] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [sector, setSector] = useState('All')
  const [type, setType] = useState('All')
  const [modal, setModal] = useState(false)

  useEffect(() => { load() }, [])
  useEffect(() => {
    if (!isSupabaseConfigured) return
    return subscribeTable('comps', load)
  }, [])

  async function load() {
    setLoading(true)
    if (!isSupabaseConfigured) { setComps(COMPS_DEMO); setLoading(false); return }
    const { data, error } = await supabase.from('comps').select('*').order('year', { ascending: false })
    if (error) toast.error(error.message)
    setComps(data || [])
    setLoading(false)
  }

  const sectors = useMemo(() => Array.from(new Set(comps.map(c => c.sector).filter(Boolean))).sort(), [comps])
  const types   = useMemo(() => Array.from(new Set(comps.map(c => c.deal_type).filter(Boolean))).sort(), [comps])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return comps.filter(c =>
      (sector === 'All' || c.sector === sector) &&
      (type === 'All' || c.deal_type === type) &&
      (!needle || [c.target, c.acquirer, c.sector, c.notes].some(v => (v || '').toLowerCase().includes(needle)))
    )
  }, [comps, q, sector, type])

  async function saveComp(payload) {
    if (!isSupabaseConfigured) {
      setComps(prev => [{ id: `local-${Date.now()}`, ...payload }, ...prev])
      setModal(false); toast.success('Comp added.'); return
    }
    const { error } = await supabase.from('comps').insert(payload)
    if (error) return toast.error(error.message)
    setModal(false); load(); toast.success('Comp added.')
  }

  async function deleteComp(c) {
    const ok = await confirm({ title: 'Delete this comp?', body: `${c.target} will be removed from the comps library.`, destructive: true, confirmLabel: 'Delete' })
    if (!ok) return
    if (!isSupabaseConfigured) { setComps(prev => prev.filter(x => x.id !== c.id)); return }
    const { error } = await supabase.from('comps').delete().eq('id', c.id)
    if (error) return toast.error(error.message)
    load(); toast.success('Comp deleted.')
  }

  return (
    <div className="space-y-6">
      <div className="vl-card p-4">
        <p className="text-sm font-semibold text-white">Precedent transactions</p>
        <p className="mt-0.5 text-xs text-valence-muted">Our internal comps library. Feed it with every relevant deal you come across — it sets pricing conversations.</p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex flex-1 min-w-[240px] items-center gap-2 rounded-lg border border-valence-border bg-white/[0.03] px-3 py-2">
            <Search className="h-3.5 w-3.5 text-valence-subtle" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search target, acquirer, sector…" className="flex-1 bg-transparent text-sm text-white placeholder:text-valence-subtle outline-none" />
          </div>
          <Select label="Sector" value={sector} onChange={setSector} options={['All', ...sectors]} />
          <Select label="Type"   value={type}   onChange={setType}   options={['All', ...types]} />
          <button onClick={() => setModal(true)} className="vl-btn-primary">
            <Plus className="h-4 w-4" /> Add comp
          </button>
        </div>
      </div>

      {loading ? (
        <div className="vl-card p-4 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 rounded-lg bg-white/[0.04] animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={TableIcon} title="No comps yet" description="Add a precedent transaction to build your pricing reference." action={<button onClick={() => setModal(true)} className="vl-btn-primary"><Plus className="h-4 w-4" /> Add comp</button>} />
      ) : (
        <div className="vl-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-valence-border text-left text-[11px] font-semibold uppercase tracking-wider text-valence-muted">
                  <th className="px-5 py-3.5">Target</th>
                  <th className="px-5 py-3.5">Acquirer</th>
                  <th className="px-5 py-3.5">Year</th>
                  <th className="px-5 py-3.5">Sector</th>
                  <th className="px-5 py-3.5">Type</th>
                  <th className="px-5 py-3.5 text-right">EV (USD M)</th>
                  <th className="px-5 py-3.5 text-right">Rev x</th>
                  <th className="px-5 py-3.5 text-right">EBITDA x</th>
                  <th className="px-5 py-3.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-valence-border">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-white/[0.03] transition">
                    <td className="px-5 py-3 text-sm font-semibold text-white">{c.target}</td>
                    <td className="px-5 py-3 text-xs text-valence-muted">{c.acquirer || '—'}</td>
                    <td className="px-5 py-3 text-xs text-valence-muted tabular-nums">{c.year || '—'}</td>
                    <td className="px-5 py-3"><span className="vl-chip">{c.sector || '—'}</span></td>
                    <td className="px-5 py-3"><span className="vl-chip">{c.deal_type || '—'}</span></td>
                    <td className="px-5 py-3 text-right text-xs font-semibold text-valence-blue tabular-nums">{c.ev_usd_m ? `$${Number(c.ev_usd_m).toLocaleString()}M` : '—'}</td>
                    <td className="px-5 py-3 text-right text-xs text-white tabular-nums">{c.revenue_multiple ? `${Number(c.revenue_multiple).toFixed(1)}x` : '—'}</td>
                    <td className="px-5 py-3 text-right text-xs text-white tabular-nums">{c.ebitda_multiple ? `${Number(c.ebitda_multiple).toFixed(1)}x` : '—'}</td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => deleteComp(c)} className="vl-btn-ghost text-valence-subtle hover:text-valence-danger" aria-label="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Add precedent transaction" size="lg">
        <CompForm onCancel={() => setModal(false)} onSubmit={saveComp} />
      </Modal>
    </div>
  )
}

function Chip({ active, onClick, children, small = false }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 ${small ? 'py-0.5 text-[11px]' : 'py-1 text-xs'} font-semibold transition ${
        active
          ? 'border-valence-blue/40 bg-valence-blue-soft text-valence-blue'
          : 'border-valence-border bg-white/[0.03] text-valence-muted hover:text-valence-text'
      }`}
    >
      {children}
    </button>
  )
}

function Select({ value, onChange, label, options }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-valence-border bg-white/[0.03] pl-3 pr-2 py-2 text-xs font-medium text-valence-muted">
      <span className="text-[11px] uppercase tracking-wider">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="bg-transparent pr-1 text-sm font-semibold text-white outline-none">
        {options.map(o => <option key={o} className="bg-valence-surface" value={o}>{o}</option>)}
      </select>
    </label>
  )
}

function DocForm({ onSubmit, onCancel }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tagsStr, setTagsStr] = useState('')
  const [sector, setSector] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!title.trim() || !content.trim()) return
    setSubmitting(true)
    const tags = tagsStr.split(',').map(t => t.trim()).filter(Boolean)
    await onSubmit({ title: title.trim(), content: content.trim(), tags, sector: sector.trim() || null })
    setSubmitting(false)
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="vl-label">Title</label>
        <input className="vl-input" value={title} onChange={e => setTitle(e.target.value)} required autoFocus />
      </div>
      <div>
        <label className="vl-label">Content</label>
        <textarea className="vl-input min-h-[180px]" value={content} onChange={e => setContent(e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="vl-label">Sector</label>
          <input className="vl-input" value={sector} onChange={e => setSector(e.target.value)} placeholder="e.g. Healthcare" />
        </div>
        <div>
          <label className="vl-label">Tags <span className="text-valence-subtle normal-case tracking-normal">(comma separated)</span></label>
          <input className="vl-input" value={tagsStr} onChange={e => setTagsStr(e.target.value)} placeholder="thesis, Q2, memo" />
        </div>
      </div>
      <div className="flex items-center justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="vl-btn-secondary">Cancel</button>
        <button type="submit" disabled={submitting} className="vl-btn-primary">
          <TagIcon className="h-4 w-4" /> {submitting ? 'Saving…' : 'Publish'}
        </button>
      </div>
    </form>
  )
}

function CompForm({ onSubmit, onCancel }) {
  const [form, setForm] = useState({ target: '', acquirer: '', year: '', sector: '', deal_type: 'M&A', ev_usd_m: '', revenue_multiple: '', ebitda_multiple: '', notes: '' })
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))
  async function submit(e) {
    e.preventDefault()
    if (!form.target.trim()) return
    await onSubmit({
      target: form.target.trim(),
      acquirer: form.acquirer.trim() || null,
      year: form.year ? Number(form.year) : null,
      sector: form.sector.trim() || null,
      deal_type: form.deal_type || null,
      ev_usd_m: form.ev_usd_m === '' ? null : Number(form.ev_usd_m),
      revenue_multiple: form.revenue_multiple === '' ? null : Number(form.revenue_multiple),
      ebitda_multiple:  form.ebitda_multiple  === '' ? null : Number(form.ebitda_multiple),
      notes: form.notes.trim() || null
    })
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div><label className="vl-label">Target</label><input className="vl-input" value={form.target} onChange={e => set('target', e.target.value)} required autoFocus /></div>
        <div><label className="vl-label">Acquirer / Investor</label><input className="vl-input" value={form.acquirer} onChange={e => set('acquirer', e.target.value)} /></div>
        <div><label className="vl-label">Year</label><input className="vl-input" type="number" value={form.year} onChange={e => set('year', e.target.value)} /></div>
        <div>
          <label className="vl-label">Type</label>
          <select className="vl-input" value={form.deal_type} onChange={e => set('deal_type', e.target.value)}>
            {['M&A','ECM','PE/VC','DCM'].map(t => <option key={t} className="bg-valence-surface" value={t}>{t}</option>)}
          </select>
        </div>
        <div className="col-span-2"><label className="vl-label">Sector</label><input className="vl-input" value={form.sector} onChange={e => set('sector', e.target.value)} /></div>
        <div><label className="vl-label">EV (USD M)</label><input className="vl-input" type="number" value={form.ev_usd_m} onChange={e => set('ev_usd_m', e.target.value)} /></div>
        <div><label className="vl-label">Revenue multiple</label><input className="vl-input" type="number" step="0.1" value={form.revenue_multiple} onChange={e => set('revenue_multiple', e.target.value)} /></div>
        <div className="col-span-2"><label className="vl-label">EBITDA multiple</label><input className="vl-input" type="number" step="0.1" value={form.ebitda_multiple} onChange={e => set('ebitda_multiple', e.target.value)} /></div>
        <div className="col-span-2"><label className="vl-label">Notes</label><textarea className="vl-input min-h-[80px]" value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
      </div>
      <div className="flex items-center justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="vl-btn-secondary">Cancel</button>
        <button type="submit" className="vl-btn-primary">Add</button>
      </div>
    </form>
  )
}

function GridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="vl-card p-5 animate-pulse">
          <div className="h-4 w-20 rounded-full bg-white/[0.06]" />
          <div className="mt-4 h-4 w-3/4 rounded bg-white/[0.08]" />
          <div className="mt-3 space-y-2">
            <div className="h-3 w-full rounded bg-white/[0.05]" />
            <div className="h-3 w-5/6 rounded bg-white/[0.05]" />
          </div>
        </div>
      ))}
    </div>
  )
}
