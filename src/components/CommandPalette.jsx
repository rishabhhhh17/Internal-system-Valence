import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Briefcase, BookOpen, CalendarDays, Users, CheckCircle2,
  CornerDownLeft, Sparkles, LayoutDashboard, ArrowRight, File as FileIcon,
  FolderOpen
} from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { searchKnowledge } from '../lib/knowledge.js'

const QUICK_NAV = [
  { type: 'nav', title: 'Overview',       sub: 'Dashboard',        to: '/',          icon: LayoutDashboard },
  { type: 'nav', title: 'Deal Logger',    sub: 'Pipeline & files', to: '/deals',     icon: Briefcase },
  { type: 'nav', title: 'Knowledge Base', sub: 'Docs, files, comps', to: '/knowledge', icon: BookOpen },
  { type: 'nav', title: 'Day Planner',    sub: 'Meetings & tasks', to: '/planner',   icon: CalendarDays },
  { type: 'nav', title: 'Drive',          sub: 'Your Google Drive', to: '/drive',    icon: FolderOpen },
  { type: 'nav', title: 'Team Directory', sub: 'The Valence team', to: '/team',      icon: Users }
]

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [q, setQ]       = useState('')
  const [idx, setIdx]   = useState(0)
  const [data, setData] = useState({ deals: [], docs: [], tasks: [], meetings: [], contacts: [], files: [] })
  const [kbHits, setKbHits] = useState([])
  const kbReqRef = useRef(0)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  // Global ⌘K / Ctrl+K binding
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 20) }, [open])
  useEffect(() => { if (!open) { setQ(''); setIdx(0) } }, [open])
  useEffect(() => { setIdx(0) }, [q])

  useEffect(() => {
    if (!open) return
    if (!isSupabaseConfigured) return
    ;(async () => {
      const [d, doc, t, m, c, f] = await Promise.all([
        supabase.from('deals').select('id, client_name, deal_type, stage, sector').limit(100),
        supabase.from('documents').select('id, title, sector, tags').limit(100),
        supabase.from('tasks').select('id, title, completed').limit(100),
        supabase.from('meetings').select('id, title, attendee_name, date, time').limit(100),
        supabase.from('contacts').select('id, name, company, role, deal_id').limit(200),
        supabase.from('knowledge_files').select('id, name, sector, tags').limit(100)
      ])
      setData({
        deals:    d.data    || [],
        docs:     doc.data  || [],
        tasks:    t.data    || [],
        meetings: m.data    || [],
        contacts: c.data    || [],
        files:    f.data    || []
      })
    })()
  }, [open])

  // Live semantic search against knowledge_chunks. Debounced. Ignores stale responses.
  useEffect(() => {
    if (!open) { setKbHits([]); return }
    const needle = q.trim()
    if (!needle || !isSupabaseConfigured) { setKbHits([]); return }
    const myReq = ++kbReqRef.current
    const t = setTimeout(async () => {
      try {
        const { results } = await searchKnowledge(needle, { matchCount: 12 })
        if (myReq === kbReqRef.current) setKbHits(results || [])
      } catch { if (myReq === kbReqRef.current) setKbHits([]) }
    }, 180)
    return () => clearTimeout(t)
  }, [q, open])

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const nav = QUICK_NAV.filter(x => !needle || x.title.toLowerCase().includes(needle))

    if (!needle) return [...nav.map(x => ({ ...x, group: 'Jump to' }))]

    const out = []
    out.push(...nav.map(x => ({ ...x, group: 'Jump to' })))

    for (const d of data.deals) {
      if (match(d.client_name, needle) || match(d.sector, needle) || match(d.deal_type, needle))
        out.push({ type: 'deal', title: d.client_name, sub: `${d.deal_type} · ${d.stage}${d.sector ? ' · ' + d.sector : ''}`, to: `/deals?open=${d.id}`, icon: Briefcase, group: 'Deals' })
    }
    for (const doc of data.docs) {
      if (match(doc.title, needle) || match(doc.sector, needle) || (doc.tags || []).some(t => match(t, needle)))
        out.push({ type: 'doc', title: doc.title, sub: doc.sector || 'Document', to: `/knowledge?open=${doc.id}`, icon: BookOpen, group: 'Knowledge' })
    }
    for (const m of data.meetings) {
      if (match(m.title, needle) || match(m.attendee_name, needle))
        out.push({ type: 'meeting', title: m.title, sub: `${m.attendee_name} · ${m.date} ${m.time?.slice(0,5)}`, to: '/planner', icon: CalendarDays, group: 'Meetings' })
    }
    for (const t of data.tasks) {
      if (match(t.title, needle))
        out.push({ type: 'task', title: t.title, sub: t.completed ? 'Completed' : 'Open', to: '/planner', icon: CheckCircle2, group: 'Tasks' })
    }
    for (const c of data.contacts) {
      if (match(c.name, needle) || match(c.company, needle))
        out.push({ type: 'contact', title: c.name, sub: [c.role, c.company].filter(Boolean).join(' · ') || 'Counterparty', to: c.deal_id ? `/deals?open=${c.deal_id}` : '/deals', icon: Users, group: 'Counterparties' })
    }
    for (const f of data.files) {
      if (match(f.name, needle) || match(f.sector, needle) || (f.tags || []).some(t => match(t, needle)))
        out.push({ type: 'file', title: f.name, sub: f.sector || 'File', to: `/knowledge`, icon: FileIcon, group: 'Files' })
    }
    // Knowledge Base full-content hits (dedupe against what we already added)
    const haveIds = new Set(out.map(o => `${o.type}:${o.title}`))
    for (const h of kbHits) {
      if (h.source_type === 'document') {
        if (!haveIds.has('doc:' + h.title))
          out.push({ type: 'doc', title: h.title, sub: 'Memo content match', to: `/knowledge?open=${h.source_id}`, icon: BookOpen, group: 'In content' })
      } else if (h.source_type === 'deal') {
        if (!haveIds.has('deal:' + h.title))
          out.push({ type: 'deal', title: h.title, sub: 'Deal note match', to: `/deals?open=${h.source_id}`, icon: Briefcase, group: 'In content' })
      } else if (h.source_type === 'file') {
        out.push({ type: 'file', title: h.title, sub: 'File content match', to: `/knowledge`, icon: FileIcon, group: 'In content' })
      } else if (h.source_type === 'comp') {
        out.push({ type: 'comp', title: h.title, sub: 'Precedent comp', to: `/knowledge`, icon: BookOpen, group: 'In content' })
      }
    }
    return out.slice(0, 50)
  }, [q, data, kbHits])

  function pick(item) {
    setOpen(false)
    if (item.to) navigate(item.to)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, results.length - 1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)) }
      if (e.key === 'Enter')     { e.preventDefault(); if (results[idx]) pick(results[idx]) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, results, idx])

  if (!open) return null

  // Group results by .group preserving insertion order
  const grouped = []
  const seen = new Map()
  for (const r of results) {
    if (!seen.has(r.group)) { seen.set(r.group, grouped.length); grouped.push([r.group, []]) }
    grouped[seen.get(r.group)][1].push(r)
  }

  let runningIdx = 0

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[14vh] animate-fade-in">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-xl animate-slide-up rounded-2xl border border-valence-border-strong bg-valence-surface shadow-valence overflow-hidden">
        <div className="flex items-center gap-3 border-b border-valence-border px-4 py-3">
          <Search className="h-4 w-4 text-valence-blue" />
          <input
            ref={inputRef}
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search deals, docs, meetings, counterparties…"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-valence-subtle outline-none"
          />
          <span className="vl-kbd">ESC</span>
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-2">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-valence-muted">
              Nothing found for <span className="text-white">"{q}"</span>.
            </div>
          ) : grouped.map(([group, items]) => (
            <div key={group} className="px-2 pb-2">
              <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-valence-subtle">{group}</div>
              {items.map((r) => {
                const Icon = r.icon || Sparkles
                const myIdx = runningIdx++
                const active = myIdx === idx
                return (
                  <button
                    key={`${group}-${r.title}-${myIdx}`}
                    onClick={() => pick(r)}
                    onMouseEnter={() => setIdx(myIdx)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${active ? 'bg-valence-blue-soft ring-1 ring-valence-blue/30' : 'hover:bg-white/[0.04]'}`}
                  >
                    <div className={`grid h-8 w-8 place-items-center rounded-md ${active ? 'bg-valence-blue/20 text-valence-blue' : 'bg-white/[0.04] text-valence-muted'}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{r.title}</p>
                      {r.sub && <p className="truncate text-[11px] text-valence-muted">{r.sub}</p>}
                    </div>
                    {active && <CornerDownLeft className="h-3.5 w-3.5 text-valence-blue" />}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-valence-border px-4 py-2 text-[11px] text-valence-subtle">
          <span className="inline-flex items-center gap-1.5"><ArrowRight className="h-3 w-3" /> Jump</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="vl-kbd">↑</span><span className="vl-kbd">↓</span> navigate · <span className="vl-kbd">↵</span> select
          </span>
        </div>
      </div>
    </div>
  )
}

function match(str, needle) {
  return (str || '').toLowerCase().includes(needle)
}
