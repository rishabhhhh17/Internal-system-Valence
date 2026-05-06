import { useEffect, useMemo, useRef, useState } from 'react'
import { format, parseISO, compareAsc, isToday, isPast, isTomorrow, addDays } from 'date-fns'
import {
  Plus, CalendarDays, CheckCircle2, Circle, Clock, Sparkles,
  Copy, Check, Trash2, Mail, User2, CalendarPlus, Wand2, RefreshCw,
  Briefcase, ListTodo, AlertTriangle, ExternalLink
} from 'lucide-react'
import { supabase, isSupabaseConfigured, subscribeTable } from '../lib/supabase.js'
import { generateDaySummary, draftMeetingMessage, isGeminiConfigured } from '../lib/gemini.js'
import { googleCalendarUrl } from '../lib/calendar.js'
import {
  listTodayEvents, computeFreeSlots, createCalendarEvent,
  GoogleAuthExpired, signInWithGoogle
} from '../lib/google.js'
import { useAuth } from '../hooks/useAuth.js'
import { logActivity } from '../lib/activity.js'
import ConfigBanner from '../components/ConfigBanner.jsx'
import Modal from '../components/Modal.jsx'
import FreeSlots from '../components/FreeSlots.jsx'
import MeetingSummary from '../components/MeetingSummary.jsx'
import { useToast } from '../components/Toast.jsx'
import { useConfirm } from '../components/ConfirmDialog.jsx'

const todayISO = () => format(new Date(), 'yyyy-MM-dd')

const demoMeetings = [
  { id: 'm1', title: 'Nimbus Health — management update', date: todayISO(), time: '11:00', attendee_name: 'Rohit Bansal',    attendee_email: 'rohit@nimbushealth.com',   status: 'Confirmed', deal_id: null },
  { id: 'm2', title: 'Arclight Capital — thesis review',  date: todayISO(), time: '15:30', attendee_name: "Serena D'Souza",  attendee_email: 'serena@arclightcap.com',   status: 'Proposed',  deal_id: null }
]
const demoTasks = [
  { id: 't1', title: 'Follow up with Nimbus Health founders', due_date: todayISO(),                                   completed: false },
  { id: 't2', title: 'Review Arclight teaser v2',             due_date: todayISO(),                                   completed: false },
  { id: 't3', title: 'Circulate Helios close memo internally', due_date: format(addDays(new Date(), 1), 'yyyy-MM-dd'), completed: false },
  { id: 't4', title: 'Prep Q&A for Quantum Edge roadshow',    due_date: format(addDays(new Date(), 2), 'yyyy-MM-dd'), completed: false }
]

export default function Planner() {
  const toast = useToast()
  const confirm = useConfirm()
  const { googleConnected, profile } = useAuth()

  const [meetings, setMeetings] = useState([])
  const [gEvents, setGEvents] = useState([])
  const [gLoading, setGLoading] = useState(false)
  const [gError, setGError] = useState('')
  const [tasks, setTasks] = useState([])
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)

  const [summary, setSummary] = useState('')
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const summaryRanForKeyRef = useRef('')

  const [meetingModal, setMeetingModal] = useState(false)
  const [summaryModal, setSummaryModal] = useState(null) // meeting object or true for standalone
  const [drafted, setDrafted] = useState(null) // { meeting, message }

  const [newTask, setNewTask] = useState('')
  const [newDue, setNewDue]   = useState(todayISO())

  useEffect(() => { load() }, [])
  useEffect(() => {
    if (!isSupabaseConfigured) return
    const offM = subscribeTable('meetings', load)
    const offT = subscribeTable('tasks',    load)
    return () => { offM(); offT() }
  }, [])

  useEffect(() => { loadGoogleEvents() }, [googleConnected])

  async function loadGoogleEvents() {
    if (!googleConnected) { setGEvents([]); setGError(''); return }
    setGLoading(true); setGError('')
    try {
      const evs = await listTodayEvents()
      setGEvents(evs)
    } catch (e) {
      if (e instanceof GoogleAuthExpired) setGError('Google session expired. Reconnect to refresh.')
      else setGError(e.message || 'Could not load Google Calendar')
    } finally {
      setGLoading(false)
    }
  }

  async function load() {
    setLoading(true)
    if (!isSupabaseConfigured) {
      setMeetings(demoMeetings); setTasks(demoTasks); setDeals([])
      setLoading(false); return
    }
    const [m, t, d] = await Promise.all([
      supabase.from('meetings').select('*').order('date').order('time'),
      supabase.from('tasks').select('*').order('completed').order('due_date', { nullsFirst: false }).order('created_at', { ascending: false }),
      supabase.from('deals').select('id, client_name, stage').order('created_at', { ascending: false })
    ])
    setMeetings(m.data || [])
    setTasks(t.data || [])
    setDeals(d.data || [])
    setLoading(false)
  }

  const today = todayISO()

  // When Google is connected, the real calendar is the source of truth for today.
  const todayFromGoogle = useMemo(() => gEvents.map(ev => googleToRow(ev)), [gEvents])
  const todayFromSupabase = useMemo(
    () => meetings.filter(m => m.date === today).sort((a, b) => a.time.localeCompare(b.time)),
    [meetings, today]
  )
  const todayMeetings = googleConnected ? todayFromGoogle : todayFromSupabase

  const upcomingMeetings = useMemo(
    () => meetings
      .filter(m => m.date > today && m.status !== 'Declined')
      .sort((a, b) => compareAsc(parseISO(a.date), parseISO(b.date)))
      .slice(0, 5),
    [meetings, today]
  )

  const freeSlots = useMemo(
    () => googleConnected ? computeFreeSlots(gEvents) : [],
    [googleConnected, gEvents]
  )

  const dueToday  = useMemo(() => tasks.filter(t => !t.completed && t.due_date === today), [tasks, today])
  const overdue   = useMemo(() => tasks.filter(t => !t.completed && t.due_date && t.due_date < today), [tasks, today])
  const upcoming  = useMemo(() => tasks.filter(t => !t.completed && t.due_date && t.due_date > today), [tasks, today])
  const completed = useMemo(() => tasks.filter(t => t.completed), [tasks])
  const openTaskCount = overdue.length + dueToday.length + upcoming.length + tasks.filter(t => !t.completed && !t.due_date).length

  // AI summary — run once per day/count combination, never in a loop
  useEffect(() => {
    if (loading || !isGeminiConfigured) return
    const key = `${today}|${todayMeetings.length}|${dueToday.length + overdue.length}`
    if (summaryRanForKeyRef.current === key) return
    summaryRanForKeyRef.current = key
    ;(async () => {
      setSummaryLoading(true); setSummaryError('')
      try {
        const text = await generateDaySummary({
          meetings: todayMeetings,
          tasks: [...overdue, ...dueToday],
          dateLabel: format(new Date(), "EEEE, d MMMM yyyy")
        })
        setSummary(text)
      } catch (e) {
        setSummaryError(e.message || 'Could not reach Gemini')
      } finally {
        setSummaryLoading(false)
      }
    })()
  }, [loading, today, todayMeetings.length, dueToday.length, overdue.length])

  async function refreshSummary() {
    summaryRanForKeyRef.current = '' // invalidate cache
    // Nudge the effect by updating a dependency indirectly — just re-run inline
    if (!isGeminiConfigured) return
    setSummaryLoading(true); setSummaryError('')
    try {
      const text = await generateDaySummary({
        meetings: todayMeetings,
        tasks: [...overdue, ...dueToday],
        dateLabel: format(new Date(), "EEEE, d MMMM yyyy")
      })
      setSummary(text)
      summaryRanForKeyRef.current = `${today}|${todayMeetings.length}|${dueToday.length + overdue.length}`
    } catch (e) {
      setSummaryError(e.message || 'Could not reach Gemini')
    } finally {
      setSummaryLoading(false)
    }
  }

  async function addMeeting(payload) {
    let created = { id: `local-${Date.now()}`, ...payload }
    if (!isSupabaseConfigured) {
      setMeetings(prev => [...prev, created])
    } else {
      const { data, error } = await supabase.from('meetings').insert(payload).select().single()
      if (error) { toast.error(error.message); return }
      created = data
      if (payload.deal_id) {
        await logActivity({ dealId: payload.deal_id, kind: 'meeting', body: `${payload.title} — ${payload.date} ${payload.time?.slice(0,5)} with ${payload.attendee_name}` })
      }
      load()
    }

    // If Google is connected, ALSO create a real Calendar event with invite
    if (googleConnected) {
      try {
        const start = new Date(`${payload.date}T${payload.time}:00`)
        const end   = new Date(start.getTime() + 30 * 60 * 1000)
        await createCalendarEvent({
          title: payload.title,
          description: '',
          start, end,
          attendees: payload.attendee_email ? [payload.attendee_email] : []
        })
        toast.success('Added to your Google Calendar.')
        loadGoogleEvents()
      } catch (e) {
        if (e instanceof GoogleAuthExpired) toast.error('Google session expired — reconnect to sync meetings.')
        else toast.error('Calendar sync failed: ' + (e.message || ''))
      }
    }

    setMeetingModal(false)

    try {
      const message = isGeminiConfigured
        ? await draftMeetingMessage({
            title: payload.title,
            date: format(parseISO(payload.date), "EEEE, d MMMM yyyy"),
            time: payload.time,
            attendeeName: payload.attendee_name
          })
        : fallbackDraft(payload)
      setDrafted({ meeting: created, message })
    } catch (err) {
      toast.info('Gemini could not draft the message — used a template instead.')
      setDrafted({ meeting: created, message: fallbackDraft(payload) })
    }
  }

  async function toggleTask(task) {
    const next = !task.completed
    if (!isSupabaseConfigured) {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: next } : t)); return
    }
    const { error } = await supabase.from('tasks').update({ completed: next }).eq('id', task.id)
    if (error) toast.error(error.message)
  }

  async function addTask(e) {
    e.preventDefault()
    const title = newTask.trim()
    if (!title) return
    const payload = { title, due_date: newDue || null, completed: false }
    if (!isSupabaseConfigured) {
      setTasks(prev => [{ id: `local-${Date.now()}`, ...payload }, ...prev])
    } else {
      const { error } = await supabase.from('tasks').insert(payload)
      if (error) { toast.error(error.message); return }
      toast.success('Task added.')
    }
    setNewTask(''); setNewDue(todayISO())
  }

  async function deleteTask(task) {
    const ok = await confirm({ title: 'Delete task?', body: `"${task.title}" will be removed.`, destructive: true, confirmLabel: 'Delete' })
    if (!ok) return
    if (!isSupabaseConfigured) {
      setTasks(prev => prev.filter(t => t.id !== task.id)); return
    }
    const { error } = await supabase.from('tasks').delete().eq('id', task.id)
    if (error) return toast.error(error.message)
  }

  return (
    <div className="space-y-6">
      <ConfigBanner />

      {/* AI Summary */}
      <AiSummaryCard
        summary={summary}
        loading={summaryLoading}
        error={summaryError}
        onRefresh={refreshSummary}
        meetingCount={todayMeetings.length}
        taskCount={dueToday.length + overdue.length}
      />

      {/* Free slots — only when Google is connected */}
      {googleConnected && (
        <section className="vl-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="vl-section-title">Free in your day</h2>
              <p className="text-xs text-valence-muted mt-0.5">
                Tap a slot to propose it to a counterparty — ValenceOS drafts the message and sends it from your Gmail.
              </p>
            </div>
            <button onClick={loadGoogleEvents} disabled={gLoading} className="vl-btn-ghost" aria-label="Refresh">
              <RefreshCw className={`h-4 w-4 ${gLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {gError ? (
            <div className="flex items-start gap-3 rounded-xl border border-valence-warning/30 bg-valence-warning/5 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-valence-warning" />
              <div className="text-sm flex-1">
                <p className="font-semibold text-valence-text">{gError}</p>
                <button onClick={() => signInWithGoogle().catch(() => {})} className="mt-1 text-[11px] font-semibold text-valence-blue hover:text-valence-text">
                  Reconnect Google →
                </button>
              </div>
            </div>
          ) : gLoading && gEvents.length === 0 ? (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-8 w-20 rounded-full bg-valence-surface animate-pulse" />
              ))}
            </div>
          ) : (
            <FreeSlots slots={freeSlots} connected={googleConnected} onSent={loadGoogleEvents} />
          )}
        </section>
      )}

      {!googleConnected && isSupabaseConfigured && (
        <div className="flex items-center gap-3 rounded-lg border border-valence-border bg-valence-surface px-4 py-2.5">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-valence-subtle" />
          <p className="flex-1 text-[12px] text-valence-muted">
            Connect Google to surface your live calendar and send meeting invites from here.
          </p>
          <button onClick={() => signInWithGoogle().catch(e => toast.error(e.message))} className="vl-btn-ghost shrink-0 text-[11px]">
            Connect Google
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Meetings */}
        <div className="lg:col-span-2 space-y-6">
          <section className="vl-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="vl-section-title">Today's meetings</h2>
                <p className="text-xs text-valence-muted mt-0.5">{format(new Date(), "EEEE, d MMMM yyyy")}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setSummaryModal(true)} className="vl-btn-secondary">
                  <Sparkles className="h-4 w-4" /> Summarise notes
                </button>
                <button onClick={() => setMeetingModal(true)} className="vl-btn-primary">
                  <Plus className="h-4 w-4" /> Schedule
                </button>
              </div>
            </div>

            {loading ? (
              <ListSkeleton rows={3} />
            ) : todayMeetings.length === 0 ? (
              <EmptyInline
                icon={CalendarDays}
                title="No meetings today"
                body="Use the scheduler to propose a time to a counterparty. ValenceOS drafts the message for you."
              />
            ) : (
              <div className="space-y-2">
                {todayMeetings.map(m => <MeetingRow key={m.id} meeting={m} dealName={dealNameFor(deals, m.deal_id)} />)}
              </div>
            )}
          </section>

          <section className="vl-card p-6">
            <h2 className="vl-section-title">Upcoming</h2>
            <p className="text-xs text-valence-muted mt-0.5">Next meetings in the pipeline</p>
            {upcomingMeetings.length === 0 ? (
              <p className="mt-4 text-sm text-valence-muted">Nothing on the horizon. Clear diary, ready to slot.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {upcomingMeetings.map(m => <MeetingRow key={m.id} meeting={m} showDate dealName={dealNameFor(deals, m.deal_id)} />)}
              </div>
            )}
          </section>
        </div>

        {/* Tasks */}
        <section className="vl-card p-6 h-fit">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="vl-section-title">Tasks</h2>
              <p className="text-xs text-valence-muted mt-0.5">
                {openTaskCount} open · {completed.length} done
              </p>
            </div>
          </div>

          <form onSubmit={addTask} className="mt-4 space-y-2">
            <input
              value={newTask} onChange={e => setNewTask(e.target.value)}
              placeholder="Add a task…"
              className="vl-input"
            />
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={newDue}
                onChange={e => setNewDue(e.target.value)}
                className="vl-input flex-1"
                title="Due date"
              />
              <button type="submit" className="vl-btn-primary" aria-label="Add task">
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
          </form>

          {loading ? (
            <div className="mt-4"><ListSkeleton rows={4} /></div>
          ) : (
            <div className="mt-5 space-y-4">
              <TaskGroup
                title="Overdue"
                tone="danger"
                items={overdue}
                onToggle={toggleTask}
                onDelete={deleteTask}
              />
              <TaskGroup
                title="Due today"
                tone="blue"
                items={dueToday}
                onToggle={toggleTask}
                onDelete={deleteTask}
              />
              <TaskGroup
                title="Upcoming"
                tone="muted"
                items={upcoming}
                onToggle={toggleTask}
                onDelete={deleteTask}
              />
              {completed.length > 0 && (
                <TaskGroup
                  title="Completed"
                  tone="success"
                  items={completed.slice(0, 8)}
                  onToggle={toggleTask}
                  onDelete={deleteTask}
                />
              )}
              {openTaskCount === 0 && completed.length === 0 && (
                <p className="text-sm text-valence-muted py-2">No tasks yet. Add your first.</p>
              )}
            </div>
          )}
        </section>
      </div>

      {/* New meeting modal */}
      <Modal
        open={meetingModal}
        onClose={() => setMeetingModal(false)}
        title="Schedule a meeting"
        description="Pick a time. ValenceOS will draft a professional message to send to the counterparty."
        size="lg"
      >
        <MeetingForm deals={deals} onCancel={() => setMeetingModal(false)} onSubmit={addMeeting} />
      </Modal>

      {/* Meeting summary modal */}
      <MeetingSummary
        open={Boolean(summaryModal)}
        onClose={() => setSummaryModal(null)}
        meeting={typeof summaryModal === 'object' ? summaryModal : null}
        deals={deals}
      />

      {/* Drafted message */}
      <Modal
        open={Boolean(drafted)}
        onClose={() => setDrafted(null)}
        title="Message drafted"
        description="Review, copy, and send. You can also add the event straight to Google Calendar."
        size="lg"
      >
        {drafted && <DraftedMessage drafted={drafted} onClose={() => setDrafted(null)} />}
      </Modal>
    </div>
  )
}

function dealNameFor(deals, id) {
  if (!id) return null
  return deals.find(d => d.id === id)?.client_name || null
}

// Normalise a Google Calendar event into the shape MeetingRow expects
function googleToRow(ev) {
  const firstAttendee = (ev.attendees || []).find(a => a.email) || {}
  return {
    id:             ev.id,
    title:          ev.summary,
    date:           ev.start ? format(ev.start, 'yyyy-MM-dd') : '',
    time:           ev.start ? format(ev.start, 'HH:mm')      : '',
    attendee_name:  firstAttendee.name  || firstAttendee.email || 'Attendee',
    attendee_email: firstAttendee.email || '',
    status:         ev.status === 'confirmed' ? 'Confirmed' : 'Proposed',
    deal_id:        null,
    _google:        true,
    _htmlLink:      ev.htmlLink,
    _location:      ev.location
  }
}

function TaskGroup({ title, tone, items, onToggle, onDelete }) {
  if (items.length === 0) return null
  const toneDot = {
    danger:  'bg-valence-danger',
    blue:    'bg-valence-blue shadow-[0_0_6px_#3399FF]',
    muted:   'bg-valence-subtle',
    success: 'bg-valence-success'
  }[tone] || 'bg-valence-subtle'
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${toneDot}`} />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-valence-muted">{title}</p>
        <span className="text-[10px] text-valence-subtle">· {items.length}</span>
      </div>
      <ul className="space-y-1.5">
        {items.map(t => <TaskItem key={t.id} task={t} onToggle={onToggle} onDelete={onDelete} />)}
      </ul>
    </div>
  )
}

function TaskItem({ task, onToggle, onDelete }) {
  const due = task.due_date ? parseISO(task.due_date) : null
  const label = !due ? null
    : isToday(due)    ? 'Today'
    : isTomorrow(due) ? 'Tomorrow'
    : format(due, 'd MMM')
  const pastDue = due && !task.completed && isPast(due) && !isToday(due)

  return (
    <li className="group flex items-center gap-3 rounded-lg border border-transparent px-3 py-2 transition hover:border-valence-border hover:bg-valence-surface">
      <button onClick={() => onToggle(task)} className="shrink-0" aria-label="Toggle task">
        {task.completed
          ? <CheckCircle2 className="h-4 w-4 text-valence-blue" />
          : <Circle className="h-4 w-4 text-valence-subtle group-hover:text-valence-text" />}
      </button>
      <span className={`flex-1 text-sm ${task.completed ? 'text-valence-subtle line-through' : 'text-valence-text'}`}>
        {task.title}
      </span>
      {label && (
        <span className={`shrink-0 text-[10px] font-semibold ${pastDue ? 'text-valence-danger' : 'text-valence-muted'}`}>
          {pastDue && <AlertTriangle className="inline h-3 w-3 mr-0.5 -mt-0.5" />}
          {label}
        </span>
      )}
      <button onClick={() => onDelete(task)} className="opacity-0 transition group-hover:opacity-100" aria-label="Delete task">
        <Trash2 className="h-3.5 w-3.5 text-valence-subtle hover:text-valence-danger" />
      </button>
    </li>
  )
}

function AiSummaryCard({ summary, loading, error, onRefresh, meetingCount, taskCount }) {
  const now = format(new Date(), "EEEE, d MMMM yyyy")
  return (
    <section className="relative overflow-hidden rounded-2xl border border-valence-border bg-valence-surface p-6">
      <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-valence-blue/10 blur-3xl" aria-hidden />
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-valence-blue-soft ring-1 ring-valence-blue/30">
              <Sparkles className="h-4 w-4 text-valence-blue" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-valence-blue">Assistant</p>
              <h3 className="text-lg font-semibold tracking-tight text-valence-text">Your day in a paragraph</h3>
              <p className="text-xs text-valence-muted mt-0.5">{now} · {meetingCount} meeting{meetingCount === 1 ? '' : 's'} · {taskCount} priority task{taskCount === 1 ? '' : 's'}</p>
            </div>
          </div>
          {isGeminiConfigured && (
            <button onClick={onRefresh} disabled={loading} className="vl-btn-ghost" aria-label="Regenerate summary">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>

        <div className="mt-4">
          {!isGeminiConfigured ? (
            <p className="text-sm leading-relaxed text-valence-muted">
              The daily assistant is offline right now. Today on the board: {meetingCount} meeting{meetingCount === 1 ? '' : 's'} and {taskCount} priority task{taskCount === 1 ? '' : 's'}.
            </p>
          ) : loading && !summary ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-3 w-full rounded bg-valence-surface" />
              <div className="h-3 w-11/12 rounded bg-valence-surface" />
              <div className="h-3 w-4/5 rounded bg-valence-surface" />
            </div>
          ) : error ? (
            <p className="text-sm text-valence-danger">Couldn't reach Gemini: {error}</p>
          ) : (
            <p className="text-[15px] leading-relaxed text-valence-text">{summary || '—'}</p>
          )}
        </div>
      </div>
    </section>
  )
}

function MeetingRow({ meeting, showDate = false, dealName }) {
  const statusColor = {
    Confirmed: 'text-valence-success',
    Proposed:  'text-valence-warning',
    Declined:  'text-valence-danger',
    Completed: 'text-valence-muted'
  }[meeting.status] || 'text-valence-muted'

  return (
    <div className="flex items-center gap-4 rounded-lg border border-valence-border bg-valence-surface px-4 py-3 hover:bg-valence-surface transition">
      <div className="w-16 shrink-0 text-right">
        <p className="text-sm font-semibold tabular-nums text-valence-text">{meeting.time?.slice(0,5)}</p>
        {showDate && <p className="text-[10px] text-valence-subtle">{format(parseISO(meeting.date), 'd MMM')}</p>}
      </div>
      <div className="h-8 w-px bg-valence-border" />
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-semibold text-valence-text">{meeting.title}</p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-valence-muted">
          <User2 className="h-3 w-3" />
          <span className="truncate">{meeting.attendee_name}</span>
          <span className="text-valence-subtle">·</span>
          <a href={`mailto:${meeting.attendee_email}`} className="truncate hover:text-valence-blue">{meeting.attendee_email}</a>
          {dealName && (
            <>
              <span className="text-valence-subtle">·</span>
              <span className="inline-flex items-center gap-1 text-valence-blue"><Briefcase className="h-3 w-3" />{dealName}</span>
            </>
          )}
        </div>
      </div>
      <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${statusColor}`}>
        <Circle className="h-1.5 w-1.5 fill-current" /> {meeting.status}
      </span>
    </div>
  )
}

function EmptyInline({ icon: Icon, title, body }) {
  return (
    <div className="flex items-start gap-4 rounded-lg border border-dashed border-valence-border px-5 py-6">
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-valence-blue-soft ring-1 ring-valence-blue/20">
        <Icon className="h-4 w-4 text-valence-blue" />
      </div>
      <div>
        <p className="text-sm font-semibold text-valence-text">{title}</p>
        <p className="mt-0.5 text-xs text-valence-muted max-w-md">{body}</p>
      </div>
    </div>
  )
}

function MeetingForm({ deals = [], onSubmit, onCancel }) {
  const [form, setForm] = useState({
    title: '',
    date: todayISO(),
    time: '10:00',
    attendee_name: '',
    attendee_email: '',
    status: 'Proposed',
    deal_id: ''
  })
  const [submitting, setSubmitting] = useState(false)
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    setSubmitting(true)
    await onSubmit({ ...form, deal_id: form.deal_id || null })
    setSubmitting(false)
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="vl-label">Meeting title</label>
        <input className="vl-input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Thesis review — Arclight Capital" required autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="vl-label">Date</label>
          <input type="date" className="vl-input" value={form.date} onChange={e => set('date', e.target.value)} required />
        </div>
        <div>
          <label className="vl-label">Time</label>
          <input type="time" className="vl-input" value={form.time} onChange={e => set('time', e.target.value)} required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="vl-label">Attendee name</label>
          <input className="vl-input" value={form.attendee_name} onChange={e => set('attendee_name', e.target.value)} placeholder="e.g. Serena D'Souza" required />
        </div>
        <div>
          <label className="vl-label">Attendee email</label>
          <input type="email" className="vl-input" value={form.attendee_email} onChange={e => set('attendee_email', e.target.value)} placeholder="name@firm.com" required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="vl-label">Status</label>
          <select className="vl-input" value={form.status} onChange={e => set('status', e.target.value)}>
            {['Proposed','Confirmed','Declined','Completed'].map(s => <option key={s} className="bg-valence-surface" value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="vl-label">Link to deal <span className="text-valence-subtle normal-case tracking-normal">(optional)</span></label>
          <select className="vl-input" value={form.deal_id} onChange={e => set('deal_id', e.target.value)}>
            <option className="bg-valence-surface" value="">— None —</option>
            {deals.map(d => <option key={d.id} className="bg-valence-surface" value={d.id}>{d.client_name}</option>)}
          </select>
        </div>
      </div>
      <div className="flex items-center justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="vl-btn-secondary">Cancel</button>
        <button type="submit" disabled={submitting} className="vl-btn-primary">
          <Wand2 className="h-4 w-4" /> {submitting ? 'Scheduling…' : 'Schedule & draft message'}
        </button>
      </div>
    </form>
  )
}

function DraftedMessage({ drafted, onClose }) {
  const [copied, setCopied] = useState(false)
  const textareaRef = useRef(null)
  const { meeting, message } = drafted

  const subject = `Proposing a time — ${meeting.title}`
  const current = () => textareaRef.current?.value ?? message
  const mailto  = `mailto:${encodeURIComponent(meeting.attendee_email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(current())}`
  const gcal    = googleCalendarUrl({
    title: meeting.title,
    date: meeting.date,
    time: meeting.time,
    attendeeEmail: meeting.attendee_email,
    details: current()
  })

  async function copy() {
    await navigator.clipboard.writeText(current())
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-valence-border bg-valence-surface p-4">
        <div className="flex flex-wrap items-center gap-3 text-xs text-valence-muted">
          <span className="vl-chip-blue">{meeting.status}</span>
          <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3 w-3" /> {format(parseISO(meeting.date), 'EEE, d MMM yyyy')}</span>
          <span className="inline-flex items-center gap-1.5"><Clock className="h-3 w-3" /> {meeting.time?.slice(0,5)}</span>
          <span className="inline-flex items-center gap-1.5"><User2 className="h-3 w-3" /> {meeting.attendee_name}</span>
        </div>
      </div>

      <div>
        <label className="vl-label">Message draft</label>
        <textarea
          ref={textareaRef}
          defaultValue={message}
          className="vl-input min-h-[220px] resize-y font-normal leading-relaxed"
        />
        {!isGeminiConfigured && (
          <p className="mt-2 text-[11px] text-valence-muted">
            The assistant is offline — this is a sensible fallback template. Edit before sending.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
        <button onClick={onClose} className="vl-btn-secondary">Close</button>
        <a href={gcal} target="_blank" rel="noreferrer" className="vl-btn-secondary">
          <CalendarPlus className="h-4 w-4" /> Add to Google Calendar
        </a>
        <a href={mailto} className="vl-btn-secondary">
          <Mail className="h-4 w-4" /> Open in mail
        </a>
        <button onClick={copy} className="vl-btn-primary">
          {copied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy message</>}
        </button>
      </div>
    </div>
  )
}

function fallbackDraft({ title, date, time, attendee_name }) {
  const first = (attendee_name || '').split(' ')[0] || 'there'
  const when  = `${format(parseISO(date), "EEEE, d MMMM")} at ${time}`
  return `Hi ${first},

I hope you're well. Further to our recent exchange, could we lock in ${when} for "${title}"? Happy to adjust if that window is tight — otherwise I'll treat this as confirmed and send across a calendar invite.

Looking forward to the conversation.

Best,
Valence Growth Partners`
}

function ListSkeleton({ rows = 3 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-valence-border bg-valence-surface px-4 py-3 animate-pulse">
          <div className="h-4 w-12 rounded bg-valence-surface" />
          <div className="h-6 w-px bg-valence-border" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/2 rounded bg-valence-surface" />
            <div className="h-2.5 w-1/3 rounded bg-valence-surface" />
          </div>
        </div>
      ))}
    </div>
  )
}
