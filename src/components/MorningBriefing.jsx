import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { Sparkles, Clock, CheckCircle2, Circle, RefreshCw, ArrowRight, Calendar } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { listTodayEvents, computeFreeSlots } from '../lib/google.js'
import { useAuth } from '../hooks/useAuth.js'
import { generateDaySummary, isGeminiConfigured } from '../lib/gemini.js'
import FreeSlots from './FreeSlots.jsx'

// A chat-style "chief of staff" card for the dashboard. Opens with a
// greeting, a 3-4 sentence day summary, the list of today's meetings
// and open tasks, and the day's free slots with tap-to-propose.
export default function MorningBriefing() {
  const { profile, googleConnected } = useAuth()
  const [meetings, setMeetings] = useState([])
  const [tasks, setTasks]       = useState([])
  const [gEvents, setGEvents]   = useState([])
  const [summary, setSummary]   = useState('')
  const [busy, setBusy]         = useState(false)

  const today = new Date()
  const dateLabel = format(today, 'EEEE, d MMMM yyyy')
  const hour = today.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = (profile?.name || profile?.email || 'there').split(/\s|@/)[0]

  // Load today's meetings + open tasks from Supabase
  useEffect(() => {
    if (!isSupabaseConfigured) return
    ;(async () => {
      const iso = format(today, 'yyyy-MM-dd')
      const [m, t] = await Promise.all([
        supabase.from('meetings').select('*').eq('date', iso).order('time'),
        supabase.from('tasks').select('*').eq('completed', false).order('due_date', { ascending: true })
      ])
      setMeetings(m.data || [])
      setTasks(t.data || [])
    })()
  }, [])

  // Pull today's Google Calendar events (if connected) so free-slot math is real
  useEffect(() => {
    if (!googleConnected) { setGEvents([]); return }
    ;(async () => {
      try { setGEvents(await listTodayEvents()) }
      catch { setGEvents([]) }
    })()
  }, [googleConnected])

  // Auto-generate the chief-of-staff brief whenever state changes meaningfully
  useEffect(() => {
    if (!isGeminiConfigured) {
      setSummary(fallbackSummary({ meetings, tasks, firstName, dateLabel }))
      return
    }
    let cancelled = false
    setBusy(true)
    generateDaySummary({ meetings, tasks, dateLabel })
      .then(txt => { if (!cancelled) setSummary(txt || fallbackSummary({ meetings, tasks, firstName, dateLabel })) })
      .catch(() => { if (!cancelled) setSummary(fallbackSummary({ meetings, tasks, firstName, dateLabel })) })
      .finally(() => { if (!cancelled) setBusy(false) })
    return () => { cancelled = true }
  }, [meetings.length, tasks.filter(t => !t.completed).length, dateLabel])

  const freeSlots = useMemo(() => googleConnected ? computeFreeSlots(gEvents) : [], [gEvents, googleConnected])

  async function refresh() {
    setBusy(true)
    try {
      const txt = isGeminiConfigured
        ? await generateDaySummary({ meetings, tasks, dateLabel })
        : fallbackSummary({ meetings, tasks, firstName, dateLabel })
      setSummary(txt || fallbackSummary({ meetings, tasks, firstName, dateLabel }))
    } finally { setBusy(false) }
  }

  return (
    <section className="vl-card p-8 lg:p-10 bg-gradient-to-br from-white to-valence-surface">
      {/* Header: greeting + date */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-valence-blue-soft ring-1 ring-valence-blue/20 shrink-0">
            <Sparkles className="h-4 w-4 text-valence-blue" />
          </div>
          <div>
            <p className="vl-eyebrow-ink">Your briefing</p>
            <h2 className="mt-1 font-display text-2xl font-semibold text-valence-text lg:text-3xl">
              {greeting}, {firstName}.
            </h2>
            <p className="mt-0.5 text-xs text-valence-muted">{dateLabel}</p>
          </div>
        </div>
        <button onClick={refresh} disabled={busy} className="vl-btn-ghost shrink-0" title="Regenerate briefing">
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* The AI summary — the "chat" line */}
      <p className="mt-6 max-w-3xl whitespace-pre-wrap text-[15px] leading-relaxed text-valence-text">
        {summary || <span className="text-valence-muted">Drafting your day…</span>}
      </p>

      {/* Three columns: meetings · tasks · free slots */}
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Column
          title="Today's meetings"
          icon={Calendar}
          link="/planner"
          count={meetings.length}
          empty="No meetings scheduled today."
        >
          {meetings.slice(0, 4).map(m => (
            <li key={m.id} className="flex items-start gap-3 py-2">
              <span className="text-[11px] tabular-nums font-semibold text-valence-blue shrink-0 w-12">
                {m.time?.slice(0, 5) || '--:--'}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm text-valence-text">{m.title}</p>
                <p className="truncate text-[11px] text-valence-muted">{m.attendee_name}</p>
              </div>
            </li>
          ))}
        </Column>

        <Column
          title="Open tasks"
          icon={Circle}
          link="/planner"
          count={tasks.filter(t => !t.completed).length}
          empty="Inbox zero. Nice."
        >
          {tasks.filter(t => !t.completed).slice(0, 4).map(t => (
            <li key={t.id} className="flex items-start gap-3 py-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-valence-subtle shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-valence-text">{t.title}</p>
                {t.due_date && (
                  <p className="text-[11px] text-valence-muted">Due {format(new Date(t.due_date), 'd MMM')}</p>
                )}
              </div>
            </li>
          ))}
        </Column>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="vl-eyebrow-ink flex items-center gap-1.5">
              <Clock className="h-3 w-3" /> Free slots
            </p>
            {googleConnected && (
              <Link to="/planner" className="text-[11px] font-semibold text-valence-blue hover:text-valence-blue-hover">
                Open planner <ArrowRight className="inline h-3 w-3" />
              </Link>
            )}
          </div>
          {googleConnected ? (
            <>
              <FreeSlots slots={freeSlots} connected={googleConnected} />
              {freeSlots.length > 0 && (
                <p className="mt-2 text-[11px] text-valence-muted">
                  Tap a slot to email a time to a counterparty. Gmail + Calendar invite sent in one go.
                </p>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-valence-border bg-valence-surface px-5 py-6 text-center">
              <Clock className="mx-auto h-4 w-4 text-valence-subtle" />
              <p className="mt-2 text-sm text-valence-muted">Connect Google to see free slots.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function Column({ title, icon: Icon, link, count, empty, children }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="vl-eyebrow-ink flex items-center gap-1.5">
          <Icon className="h-3 w-3" /> {title}
        </p>
        {count > 0 && (
          <Link to={link} className="text-[11px] font-semibold text-valence-blue hover:text-valence-blue-hover">
            All {count} <ArrowRight className="inline h-3 w-3" />
          </Link>
        )}
      </div>
      {count === 0 ? (
        <div className="rounded-xl border border-dashed border-valence-border bg-valence-surface px-5 py-6 text-center">
          <p className="text-sm text-valence-muted">{empty}</p>
        </div>
      ) : (
        <ul className="divide-y divide-valence-border/60 rounded-xl border border-valence-border bg-white px-4">
          {children}
        </ul>
      )}
    </div>
  )
}

function fallbackSummary({ meetings, tasks, firstName, dateLabel }) {
  const openTasks = tasks.filter(t => !t.completed).length
  const first = meetings[0]
  const bits = []
  if (first) {
    bits.push(`${first.time?.slice(0,5)} with ${first.attendee_name} — ${first.title}.`)
  } else {
    bits.push('No meetings on the board today — a rare open runway.')
  }
  if (meetings.length > 1) bits.push(`${meetings.length - 1} more after that.`)
  if (openTasks > 0) bits.push(`${openTasks} open task${openTasks === 1 ? '' : 's'} to clear.`)
  else bits.push('Task list is clear.')
  return bits.join(' ')
}
