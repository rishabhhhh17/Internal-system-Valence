import { useCallback, useEffect, useMemo, useState } from 'react'
import { Users, Split, Type, Check, Loader2, RefreshCw } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { useSeat } from '../hooks/useSeat.js'
import { useToast } from './Toast.jsx'
import { humanError } from '../lib/userError.js'

// Contact data-cleanup worksheet. Mirrors the three review tables the team
// works from — duplicates split across companies, several people captured as
// one row, and contacts with no surname — but every row applies straight to
// the database instead of round-tripping through a spreadsheet.
//
// The lists are DERIVED live from People, so a row disappears the moment it's
// fixed (here, or anywhere else in the app).

const TABS = [
  { id: 'dupes',    label: 'Multiple companies',        icon: Users, blurb: 'Same person on more than one row — usually because the company was typed differently.' },
  { id: 'combined', label: 'Multiple people, one row',  icon: Split, blurb: 'Two or more people captured as a single contact.' },
  { id: 'nolast',   label: 'No last name',              icon: Type,  blurb: 'Contacts saved with only a first name.' }
]

const SPLIT_RE = /,|&|\band\b|\/|\+/i
const splitNames = name => String(name || '').split(/\s*(?:,|&|\band\b|\/|\+)\s*/i).map(s => s.trim()).filter(Boolean)

export default function DataCleanup() {
  const { org } = useSeat()
  const toast = useToast()
  const [people, setPeople]   = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab]         = useState('dupes')
  const [edits, setEdits]     = useState({})
  const [busy, setBusy]       = useState(null)

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('people')
      .select('id, full_name, company, email, role, is_valence_team')
      .order('full_name')
    if (error) toast.error(humanError(error, 'Could not load contacts'))
    setPeople(data || [])
    setLoading(false)
  }, [])                      // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // ── derive the three worklists ─────────────────────────────────────────
  const dupes = useMemo(() => {
    const m = new Map()
    for (const p of people) {
      const k = (p.full_name || '').trim().toLowerCase()
      if (!k) continue
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(p)
    }
    return [...m.entries()]
      .filter(([, rows]) => rows.length > 1)
      .map(([key, rows]) => ({
        key, name: rows[0].full_name, rows,
        companies: [...new Set(rows.map(r => (r.company || '').trim()).filter(Boolean))]
      }))
      .sort((a, b) => b.rows.length - a.rows.length || a.name.localeCompare(b.name))
  }, [people])

  const combined = useMemo(
    () => people.filter(p => (p.role || '') !== 'company' && SPLIT_RE.test(p.full_name || ''))
                .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')),
    [people]
  )

  const noLast = useMemo(
    () => people.filter(p => {
      const n = (p.full_name || '').trim()
      return n && !/\s/.test(n) && (p.role || '') !== 'company' && !p.is_valence_team
    }).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')),
    [people]
  )

  const setEdit = (k, patch) => setEdits(e => ({ ...e, [k]: { ...(e[k] || {}), ...patch } }))

  // ── apply actions ──────────────────────────────────────────────────────
  async function applyMerge(group) {
    const k = `d:${group.key}`
    const state = edits[k] || {}
    const company = (state.company ?? group.companies[0] ?? '').trim()
    setBusy(k)
    try {
      const primary = group.rows.find(r => (r.company || '').trim().toLowerCase() === company.toLowerCase()) || group.rows[0]
      const dupeIds = group.rows.filter(r => r.id !== primary.id).map(r => r.id)
      if (dupeIds.length) {
        const { error } = await supabase.rpc('merge_people', { p_primary: primary.id, p_dupes: dupeIds })
        if (error) throw error
      }
      if (company && company !== (primary.company || '')) {
        const { error } = await supabase.from('people').update({ company }).eq('id', primary.id)
        if (error) throw error
      }
      toast.success(`${group.name} merged into one contact${company ? ` @ ${company}` : ''}`)
      await load()
    } catch (err) { toast.error(humanError(err, 'Could not merge')) }
    finally { setBusy(null) }
  }

  async function applyDifferentPeople(group) {
    const k = `d:${group.key}`
    const state = edits[k] || {}
    setBusy(k)
    try {
      for (const r of group.rows) {
        const row = state[`row:${r.id}`] || {}
        const name = (row.name ?? r.full_name ?? '').trim()
        const company = (row.company ?? r.company ?? '').trim()
        if (!name) continue
        if (name !== r.full_name || company !== (r.company || '')) {
          const { error } = await supabase.from('people')
            .update({ full_name: name, company: company || null }).eq('id', r.id)
          if (error) throw error
        }
      }
      toast.success(`${group.name} kept as separate people`)
      await load()
    } catch (err) { toast.error(humanError(err, 'Could not save')) }
    finally { setBusy(null) }
  }

  async function applySplit(person) {
    const k = `c:${person.id}`
    const parts = (edits[k]?.parts) || defaultParts(person)
    const clean = parts.filter(p => (p.name || '').trim())
    if (!clean.length) return
    setBusy(k)
    try {
      const [first, ...rest] = clean
      const { error } = await supabase.from('people')
        .update({ full_name: first.name.trim(), company: (first.company || '').trim() || null })
        .eq('id', person.id)
      if (error) throw error
      for (const r of rest) {
        const { error: insErr } = await supabase.from('people').insert({
          org_id: org?.id, full_name: r.name.trim(), company: (r.company || '').trim() || null
        })
        if (insErr) throw insErr
      }
      toast.success(rest.length ? `Split into ${clean.length} contacts` : `Kept as ${first.name.trim()}`)
      await load()
    } catch (err) { toast.error(humanError(err, 'Could not split')) }
    finally { setBusy(null) }
  }

  async function applyRename(person) {
    const k = `n:${person.id}`
    const name = (edits[k]?.name ?? '').trim()
    if (!name || name === person.full_name) return
    setBusy(k)
    try {
      const { error } = await supabase.from('people').update({ full_name: name }).eq('id', person.id)
      if (error) throw error
      toast.success(`Renamed to ${name}`)
      await load()
    } catch (err) { toast.error(humanError(err, 'Could not rename')) }
    finally { setBusy(null) }
  }

  const counts = { dupes: dupes.length, combined: combined.length, nolast: noLast.length }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                active ? 'border-valence-blue/40 bg-valence-blue-soft text-valence-blue' : 'border-valence-border bg-valence-surface text-valence-muted hover:text-valence-text'}`}>
              <Icon className="h-3.5 w-3.5" /> {t.label}
              <span className="ml-1 rounded-full bg-white/70 px-1.5 text-[10px] tabular-nums">{counts[t.id]}</span>
            </button>
          )
        })}
        <button onClick={load} className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-valence-muted hover:text-valence-text">
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      <p className="text-[11px] text-valence-muted">{TABS.find(t => t.id === tab)?.blurb}</p>

      {loading ? (
        <p className="py-8 text-center text-sm text-valence-subtle">Loading contacts…</p>
      ) : tab === 'dupes' ? (
        <Worksheet head={['Person', 'Rows', 'Companies seen', 'Corrected', '']} empty="No duplicate names — all clean.">
          {dupes.map(g => {
            const k = `d:${g.key}`
            const st = edits[k] || {}
            const different = !!st.different
            return (
              <tr key={k} className="align-top">
                <td className="px-3 py-3 text-sm font-medium text-valence-text">{g.name}</td>
                <td className="px-3 py-3 text-xs tabular-nums text-valence-muted">{g.rows.length}</td>
                <td className="px-3 py-3 text-xs text-valence-muted">{g.companies.join(' · ') || '(none)'}</td>
                <td className="px-3 py-3">
                  <label className="mb-2 inline-flex items-center gap-1.5 text-[11px] text-valence-muted">
                    <input type="checkbox" checked={different} onChange={e => setEdit(k, { different: e.target.checked })} />
                    These are actually different people
                  </label>
                  {!different ? (
                    <input list={`co-${g.key}`} className="vl-input h-8 w-full text-xs"
                      placeholder="Keep as one person at…"
                      value={st.company ?? g.companies[0] ?? ''}
                      onChange={e => setEdit(k, { company: e.target.value })} />
                  ) : (
                    <div className="space-y-1.5">
                      {g.rows.map(r => {
                        const row = st[`row:${r.id}`] || {}
                        return (
                          <div key={r.id} className="flex gap-1.5">
                            <input className="vl-input h-8 w-[46%] text-xs" placeholder="Full name"
                              value={row.name ?? r.full_name ?? ''}
                              onChange={e => setEdit(k, { [`row:${r.id}`]: { ...row, name: e.target.value } })} />
                            <input className="vl-input h-8 w-[46%] text-xs" placeholder="Company"
                              value={row.company ?? r.company ?? ''}
                              onChange={e => setEdit(k, { [`row:${r.id}`]: { ...row, company: e.target.value } })} />
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <datalist id={`co-${g.key}`}>{g.companies.map(c => <option key={c} value={c} />)}</datalist>
                </td>
                <td className="px-3 py-3">
                  <ApplyBtn busy={busy === k} onClick={() => (different ? applyDifferentPeople(g) : applyMerge(g))}
                    label={different ? 'Save both' : 'Merge'} />
                </td>
              </tr>
            )
          })}
        </Worksheet>
      ) : tab === 'combined' ? (
        <Worksheet head={['Listed as', 'Company', 'Corrected — split into', '']} empty="No combined rows — all clean.">
          {combined.map(p => {
            const k = `c:${p.id}`
            const parts = edits[k]?.parts || defaultParts(p)
            return (
              <tr key={k} className="align-top">
                <td className="px-3 py-3 text-sm font-medium text-valence-text">{p.full_name}</td>
                <td className="px-3 py-3 text-xs text-valence-muted">{p.company || '—'}</td>
                <td className="px-3 py-3">
                  <div className="space-y-1.5">
                    {parts.map((part, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <input className="vl-input h-8 w-[44%] text-xs" placeholder="Full name" value={part.name}
                          onChange={e => { const next = parts.map((x, j) => j === i ? { ...x, name: e.target.value } : x); setEdit(k, { parts: next }) }} />
                        <input className="vl-input h-8 w-[44%] text-xs" placeholder="Company" value={part.company}
                          onChange={e => { const next = parts.map((x, j) => j === i ? { ...x, company: e.target.value } : x); setEdit(k, { parts: next }) }} />
                        <button type="button" title="Remove this person"
                          onClick={() => setEdit(k, { parts: parts.filter((_, j) => j !== i) })}
                          className="text-valence-subtle hover:text-valence-danger">×</button>
                      </div>
                    ))}
                    <button type="button" onClick={() => setEdit(k, { parts: [...parts, { name: '', company: p.company || '' }] })}
                      className="text-[11px] font-semibold text-valence-blue hover:underline">+ add person</button>
                  </div>
                  <p className="mt-1 text-[10px] text-valence-subtle">The first person keeps this record (and its interactions); the rest are created as new contacts.</p>
                </td>
                <td className="px-3 py-3"><ApplyBtn busy={busy === k} onClick={() => applySplit(p)} label="Split" /></td>
              </tr>
            )
          })}
        </Worksheet>
      ) : (
        <Worksheet head={['First name', 'Company', 'Corrected — full name', '']} empty="Every contact has a surname.">
          {noLast.map(p => {
            const k = `n:${p.id}`
            return (
              <tr key={k}>
                <td className="px-3 py-3 text-sm font-medium text-valence-text">{p.full_name}</td>
                <td className="px-3 py-3 text-xs text-valence-muted">{p.company || '—'}</td>
                <td className="px-3 py-3">
                  <input className="vl-input h-8 w-full text-xs" placeholder={`${p.full_name} …`}
                    value={edits[k]?.name ?? ''}
                    onChange={e => setEdit(k, { name: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') applyRename(p) }} />
                </td>
                <td className="px-3 py-3"><ApplyBtn busy={busy === k} onClick={() => applyRename(p)} label="Save" /></td>
              </tr>
            )
          })}
        </Worksheet>
      )}
    </div>
  )
}

function defaultParts(person) {
  const names = splitNames(person.full_name)
  const co = person.company || ''
  return (names.length ? names : [person.full_name || '']).map(n => ({ name: n, company: co }))
}

function Worksheet({ head, children, empty }) {
  const rows = Array.isArray(children) ? children.filter(Boolean) : (children ? [children] : [])
  if (rows.length === 0) {
    return <div className="rounded-lg border border-dashed border-valence-border bg-valence-surface px-4 py-8 text-center text-sm text-valence-muted">{empty}</div>
  }
  return (
    <div className="vl-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-valence-border text-left text-[10px] font-semibold uppercase tracking-wider text-valence-muted">
              {head.map((h, i) => <th key={i} className="px-3 py-2.5">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-valence-border/60">{rows}</tbody>
        </table>
      </div>
    </div>
  )
}

function ApplyBtn({ busy, onClick, label }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} className="vl-btn-primary-sm whitespace-nowrap disabled:opacity-60">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} {label}
    </button>
  )
}
