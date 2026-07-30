import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { format } from 'date-fns'
import { fmtDate } from '../lib/formatDate.js'
import { Check, Plus, Archive, X, CornerDownRight, ListTodo, Trash2, ChevronDown, ChevronUp, Pencil } from 'lucide-react'
import { supabase, isSupabaseConfigured, subscribeTable } from '../lib/supabase.js'
import { useToast } from './Toast.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { useSeat } from '../hooks/useSeat.js'

// Daily task list for the Today page. Deliberately NOT the Kanban / projects
// board — these are the plain "get it done today" items. Anything unfinished
// stays visible day to day (carry-over); ticking one files it into the
// history archive (created_at → completed_at). Tasks can be tagged to one or
// more teammates; untagged means it's on you / the team in general.
function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const initialsOf = name => (name || '?').split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()
const AV_COLORS = ['bg-valence-blue', 'bg-emerald-500', 'bg-indigo-500', 'bg-amber-500', 'bg-rose-500', 'bg-teal-500']
const colorFor = id => AV_COLORS[Math.abs(String(id).split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % AV_COLORS.length]

export default function DailyTasks() {
  const { session } = useAuth()
  const { org } = useSeat()
  const toast = useToast()
  const me = session?.user?.id || null
  const orgId = org?.id || null
  const today = todayIso()

  const [tasks, setTasks]   = useState([])
  const [roster, setRoster] = useState([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [filter, setFilter] = useState('mine')          // 'mine' | 'all' | <userId>
  const [assignFor, setAssignFor] = useState(null)      // task id whose assignee popover is open
  const [subFor, setSubFor] = useState(null)            // task id we're adding a sub-bullet to
  const [subTitle, setSubTitle] = useState('')
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [showDone, setShowDone] = useState(false)

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return }
    const [{ data: t }, seatRes] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: true }),
      orgId ? supabase.from('seats').select('user_id, full_name, email').eq('org_id', orgId).eq('active', true)
            : Promise.resolve({ data: [] })
    ])
    setTasks(t || [])
    setRoster((seatRes.data || [])
      .filter(r => r.user_id)
      .map(r => ({ id: r.user_id, name: (r.full_name || r.email || 'Teammate').trim() })))
    setLoading(false)
  }, [orgId])

  useEffect(() => { load(); const off = subscribeTable('tasks', load); return () => off?.() }, [load])

  const nameFor = useCallback(id => roster.find(r => r.id === id)?.name || 'Teammate', [roster])

  const openTop  = useMemo(() => tasks.filter(t => !t.parent_id && !t.completed), [tasks])
  const childrenOf = useCallback(pid => tasks.filter(t => t.parent_id === pid).sort((a, b) => a.created_at.localeCompare(b.created_at)), [tasks])

  const matches = useCallback(t => {
    const a = t.assignee_ids || []
    if (filter === 'all')  return true
    if (filter === 'mine') return a.length === 0 || (me && a.includes(me))
    return a.includes(filter)
  }, [filter, me])

  const visible = useMemo(() => openTop.filter(matches).sort((a, b) => {
    const ad = a.due_date || '9999', bd = b.due_date || '9999'
    return ad === bd ? a.created_at.localeCompare(b.created_at) : ad.localeCompare(bd)
  }), [openTop, matches])

  const doneToday = useMemo(
    () => tasks.filter(t => !t.parent_id && t.completed && (t.completed_at || '').slice(0, 10) === today).sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || '')),
    [tasks, today]
  )

  // ── mutations (optimistic) ──────────────────────────────────────────────
  async function addTask(title, parentId = null) {
    const clean = (title || '').trim()
    if (!clean) return
    if (!isSupabaseConfigured) { toast.error('Connect the workspace to save tasks.'); return }
    const payload = {
      title: clean, org_id: orgId, due_date: today, completed: false,
      // Top-level items default to you; sub-bullets inherit their parent's owners.
      assignee_ids: parentId
        ? (tasks.find(t => t.id === parentId)?.assignee_ids || [])
        : (me ? [me] : []),
      parent_id: parentId
    }
    const { data, error } = await supabase.from('tasks').insert(payload).select().single()
    if (error) return toast.error('Could not add task')
    setTasks(prev => [...prev, data])
  }

  async function toggle(t) {
    const next = !t.completed
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, completed: next, completed_at: next ? new Date().toISOString() : null } : x))
    const { error } = await supabase.from('tasks').update({ completed: next }).eq('id', t.id)
    if (error) { toast.error('Could not update task'); load() }
  }

  async function rename(t, title) {
    const clean = (title || '').trim()
    if (!clean || clean === t.title) return
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, title: clean } : x))
    const { error } = await supabase.from('tasks').update({ title: clean }).eq('id', t.id)
    if (error) { toast.error('Could not rename task'); load() }
  }

  async function setAssignees(t, ids) {
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, assignee_ids: ids } : x))
    const { error } = await supabase.from('tasks').update({ assignee_ids: ids }).eq('id', t.id)
    if (error) { toast.error('Could not reassign'); load() }
  }
  function toggleAssignee(t, uid) {
    const a = t.assignee_ids || []
    setAssignees(t, a.includes(uid) ? a.filter(x => x !== uid) : [...a, uid])
  }

  async function remove(t) {
    setTasks(prev => prev.filter(x => x.id !== t.id && x.parent_id !== t.id))
    const { error } = await supabase.from('tasks').delete().eq('id', t.id)
    if (error) { toast.error('Could not delete'); load() }
  }

  function submitSub(parentId) {
    if (subTitle.trim()) addTask(subTitle, parentId)
    setSubTitle(''); setSubFor(null)
  }

  return (
    <section data-tour="today-tasks" className="vl-card p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="vl-eyebrow-ink inline-flex items-center gap-1.5"><ListTodo className="h-3 w-3" /> Today's tasks</p>
        <button onClick={() => setArchiveOpen(true)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-valence-muted hover:text-valence-text">
          <Archive className="h-3 w-3" /> History
        </button>
      </div>

      {/* Who — filter by owner */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <FilterChip active={filter === 'mine'} onClick={() => setFilter('mine')}>Mine</FilterChip>
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>Everyone</FilterChip>
        {roster.filter(r => r.id !== me).map(r => (
          <FilterChip key={r.id} active={filter === r.id} onClick={() => setFilter(r.id)}>
            <span className={`mr-1 inline-grid h-4 w-4 place-items-center rounded-full text-[8px] font-bold text-white ${colorFor(r.id)}`}>{initialsOf(r.name)}</span>
            {r.name.split(' ')[0]}
          </FilterChip>
        ))}
      </div>

      {/* Add */}
      <form onSubmit={e => { e.preventDefault(); addTask(newTitle); setNewTitle('') }} className="mb-3 flex items-center gap-2">
        <Plus className="h-4 w-4 text-valence-subtle" />
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          placeholder="Add a task and press Enter…"
          className="flex-1 bg-transparent text-sm text-valence-text placeholder:text-valence-subtle focus:outline-none"
        />
      </form>

      {/* Open list */}
      {loading ? (
        <p className="py-4 text-sm text-valence-subtle">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-valence-border bg-valence-surface px-4 py-5 text-center text-sm text-valence-muted">
          Nothing open{filter === 'mine' ? ' for you' : ''} — add your first task above.
        </div>
      ) : (
        <ul className="space-y-1">
          {visible.map(t => (
            <TaskRow
              key={t.id} t={t} me={me} roster={roster} today={today} nameFor={nameFor}
              subtasks={childrenOf(t.id)}
              assignOpen={assignFor === t.id} onAssignOpen={() => setAssignFor(assignFor === t.id ? null : t.id)}
              onToggleAssignee={uid => toggleAssignee(t, uid)}
              onToggle={() => toggle(t)} onToggleChild={c => toggle(c)}
              onRemove={() => remove(t)} onRemoveChild={c => remove(c)}
              onRename={title => rename(t, title)}
              subOpen={subFor === t.id} onSubOpen={() => { setSubFor(subFor === t.id ? null : t.id); setSubTitle('') }}
              subTitle={subTitle} onSubTitle={setSubTitle} onSubmitSub={() => submitSub(t.id)}
            />
          ))}
        </ul>
      )}

      {/* Done today */}
      {doneToday.length > 0 && (
        <div className="mt-3 border-t border-valence-border/60 pt-2">
          <button onClick={() => setShowDone(s => !s)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-valence-muted hover:text-valence-text">
            {showDone ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Done today · {doneToday.length}
          </button>
          {showDone && (
            <ul className="mt-1 space-y-1">
              {doneToday.map(t => (
                <li key={t.id} className="flex items-center gap-2.5 py-1">
                  <button onClick={() => toggle(t)} className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-valence-success text-white" title="Mark not done">
                    <Check className="h-2.5 w-2.5" />
                  </button>
                  <span className="text-sm text-valence-subtle line-through">{t.title}</span>
                  <span className="ml-auto text-[10px] text-valence-subtle tabular-nums">{t.completed_at ? format(new Date(t.completed_at), 'HH:mm') : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {archiveOpen && <ArchiveModal tasks={tasks} nameFor={nameFor} onClose={() => setArchiveOpen(false)} />}
    </section>
  )
}

function TaskRow({ t, me, roster, today, nameFor, subtasks, assignOpen, onAssignOpen, onToggleAssignee, onToggle, onToggleChild, onRemove, onRemoveChild, onRename, subOpen, onSubOpen, subTitle, onSubTitle, onSubmitSub }) {
  const carried = t.due_date && t.due_date < today
  const a = t.assignee_ids || []
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(t.title)
  function beginEdit() { setDraft(t.title); setEditing(true) }
  function saveEdit() { setEditing(false); onRename?.(draft) }
  return (
    <li className="group rounded-lg px-1 py-1 hover:bg-valence-surface/60 transition">
      <div className="flex items-start gap-2.5">
        <button onClick={onToggle} title="Mark done"
          className="mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-2 border-valence-border text-transparent hover:border-valence-success hover:text-valence-success transition">
          <Check className="h-2.5 w-2.5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {editing ? (
              <input
                autoFocus
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveEdit() } if (e.key === 'Escape') { setEditing(false) } }}
                className="w-full border-b border-valence-blue/40 bg-transparent text-sm text-valence-text focus:outline-none"
              />
            ) : (
              <span className="text-sm text-valence-text" onDoubleClick={beginEdit}>{t.title}</span>
            )}
            {carried && !editing && <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-px text-[9px] font-semibold text-amber-700" title={`Carried over from ${fmtDate(t.due_date, 'd MMM')}`}>carried</span>}
          </div>
        </div>

        {/* assignees */}
        <div className="relative shrink-0">
          <button onClick={onAssignOpen} title="Assign" className="flex items-center -space-x-1.5">
            {a.length === 0 ? (
              <span className="rounded-full border border-dashed border-valence-border px-2 py-0.5 text-[10px] font-medium text-valence-subtle hover:text-valence-text">Team</span>
            ) : a.map(uid => (
              <span key={uid} className={`inline-grid h-5 w-5 place-items-center rounded-full text-[9px] font-bold text-white ring-2 ring-white ${colorFor(uid)}`} title={nameFor(uid)}>
                {initialsOf(nameFor(uid))}
              </span>
            ))}
          </button>
          {assignOpen && (
            <div className="absolute right-0 top-6 z-20 w-52 rounded-lg border border-valence-border bg-valence-elevated p-1 shadow-xl">
              <p className="px-2 py-1 vl-eyebrow-ink">Assign to</p>
              {roster.map(r => {
                const on = a.includes(r.id)
                return (
                  <button key={r.id} onClick={() => onToggleAssignee(r.id)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm ${on ? 'bg-valence-blue-soft text-valence-blue' : 'text-valence-text hover:bg-valence-surface'}`}>
                    <span className={`inline-grid h-5 w-5 place-items-center rounded-full text-[9px] font-bold text-white ${colorFor(r.id)}`}>{initialsOf(r.name)}</span>
                    <span className="flex-1 text-left truncate">{r.name}{r.id === me ? ' (you)' : ''}</span>
                    {on && <Check className="h-3.5 w-3.5" />}
                  </button>
                )
              })}
              {roster.length === 0 && <p className="px-2 py-2 text-xs text-valence-subtle">Teammates appear here once they've signed in.</p>}
            </div>
          )}
        </div>

        {/* row actions */}
        <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition">
          <button onClick={beginEdit} title="Edit task" className="grid h-6 w-6 place-items-center rounded text-valence-subtle hover:text-valence-blue"><Pencil className="h-3.5 w-3.5" /></button>
          <button onClick={onSubOpen} title="Add sub-bullet" className="grid h-6 w-6 place-items-center rounded text-valence-subtle hover:text-valence-blue"><CornerDownRight className="h-3.5 w-3.5" /></button>
          <button onClick={onRemove} title="Delete" className="grid h-6 w-6 place-items-center rounded text-valence-subtle hover:text-valence-danger"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      {/* sub-bullets */}
      {(subtasks.length > 0 || subOpen) && (
        <ul className="ml-6 mt-1 space-y-0.5 border-l border-valence-border/60 pl-3">
          {subtasks.map(c => (
            <li key={c.id} className="group/sub flex items-center gap-2.5 py-0.5">
              <button onClick={() => onToggleChild(c)} title="Mark done"
                className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 transition ${c.completed ? 'border-valence-success bg-valence-success text-white' : 'border-valence-border text-transparent hover:border-valence-success'}`}>
                <Check className="h-2 w-2" />
              </button>
              <span className={`text-[13px] ${c.completed ? 'text-valence-subtle line-through' : 'text-valence-text'}`}>{c.title}</span>
              <button onClick={() => onRemoveChild(c)} className="ml-auto grid h-5 w-5 place-items-center rounded text-valence-subtle opacity-0 group-hover/sub:opacity-100 hover:text-valence-danger"><X className="h-3 w-3" /></button>
            </li>
          ))}
          {subOpen && (
            <li className="flex items-center gap-2 py-0.5">
              <CornerDownRight className="h-3 w-3 text-valence-subtle" />
              <input autoFocus value={subTitle} onChange={e => onSubTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSubmitSub() } if (e.key === 'Escape') onSubOpen() }}
                placeholder="Sub-bullet… (Enter)"
                className="flex-1 bg-transparent text-[13px] text-valence-text placeholder:text-valence-subtle focus:outline-none" />
            </li>
          )}
        </ul>
      )}
    </li>
  )
}

function FilterChip({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition ${
        active ? 'border-valence-blue/40 bg-valence-blue-soft text-valence-blue' : 'border-valence-border bg-valence-surface text-valence-muted hover:text-valence-text'}`}>
      {children}
    </button>
  )
}

// History archive — every task with when it was created and when it was ticked.
function ArchiveModal({ tasks, nameFor, onClose }) {
  const done = useMemo(
    () => tasks.filter(t => t.completed).sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || '')),
    [tasks]
  )
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl border border-valence-border bg-valence-elevated shadow-2xl">
        <div className="flex items-center justify-between border-b border-valence-border/60 px-5 py-4">
          <div>
            <p className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Archive className="h-3 w-3" /> Task history</p>
            <p className="mt-0.5 text-[11px] text-valence-muted">{done.length} completed · when it was set down and when it got done</p>
          </div>
          <button onClick={onClose} className="vl-btn-ghost text-valence-muted" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-3">
          {done.length === 0 ? (
            <p className="py-8 text-center text-sm text-valence-muted">No completed tasks yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left vl-eyebrow-ink">
                  <th className="pb-2 font-semibold">Task</th>
                  <th className="pb-2 font-semibold">Owner</th>
                  <th className="pb-2 font-semibold whitespace-nowrap">Created</th>
                  <th className="pb-2 font-semibold whitespace-nowrap">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-valence-border/50">
                {done.map(t => (
                  <tr key={t.id}>
                    <td className="py-2 pr-3 text-valence-text">{t.parent_id ? '↳ ' : ''}{t.title}</td>
                    <td className="py-2 pr-3 text-valence-muted">{(t.assignee_ids || []).length ? (t.assignee_ids).map(nameFor).map(n => n.split(' ')[0]).join(', ') : 'Team'}</td>
                    <td className="py-2 pr-3 text-valence-subtle tabular-nums whitespace-nowrap">{t.created_at ? format(new Date(t.created_at), 'd MMM') : '—'}</td>
                    <td className="py-2 text-valence-subtle tabular-nums whitespace-nowrap">{t.completed_at ? format(new Date(t.completed_at), 'd MMM, HH:mm') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
