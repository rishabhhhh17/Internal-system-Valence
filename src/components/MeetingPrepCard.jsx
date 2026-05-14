import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, Loader2, User2, MessageSquare, Briefcase, ArrowUpRight, Target, X, Copy, Check } from 'lucide-react'
import { buildMeetingPrep } from '../lib/meetingPrep.js'

// Floating prep modal opened from a calendar event row. Renders the structured
// output from `buildMeetingPrep` as a partner-facing card: persona on top,
// last interactions, related mandates, suggested talking points.

export default function MeetingPrepCard({ meeting, onClose }) {
  const [prep, setPrep] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    buildMeetingPrep(meeting || {})
      .then(p => { if (!cancelled) setPrep(p) })
      .catch(e => { if (!cancelled) setError(e?.message || 'Prep failed') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [meeting?.id])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function copyAll() {
    if (!prep) return
    const blob = [
      `MEETING PREP — ${meeting?.title || ''}`,
      meeting?.time ? `Time: ${meeting.time}` : '',
      '',
      'SUMMARY',
      prep.summary,
      '',
      prep.people[0] ? `PERSONA — ${prep.people[0].full_name}` : '',
      prep.people[0]?.how_to_talk          ? `How to talk: ${prep.people[0].how_to_talk}` : '',
      prep.people[0]?.what_they_care_about ? `What they care about: ${prep.people[0].what_they_care_about}` : '',
      '',
      prep.talkingPoints.length > 0 ? 'TALKING POINTS' : '',
      ...prep.talkingPoints.map((t, i) => `${i + 1}. ${t}`),
      '',
      prep.interactions.length > 0 ? 'RECENT INTERACTIONS' : '',
      ...prep.interactions.map(i => `· ${i.created_at?.slice(0, 10)} · ${i.type} → ${i.outcome}: ${i.notes || ''}`),
      '',
      prep.deals.length > 0 ? 'OPEN MANDATES' : '',
      ...prep.deals.map(d => `· ${d.client_name} (${d.stage})`)
    ].filter(Boolean).join('\n')
    await navigator.clipboard.writeText(blob)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[8vh] px-4" role="dialog" aria-modal="true" aria-label="Meeting prep">
      <div className="absolute inset-0 bg-valence-ink/45 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-[640px] max-h-[84vh] animate-slide-up rounded-2xl border border-valence-border bg-white shadow-valence-lg overflow-hidden flex flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-valence-border px-6 py-4 shrink-0">
          <div className="min-w-0">
            <p className="vl-eyebrow-ink inline-flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-valence-blue" /> Meeting prep
              {prep?.source === 'ai' && (
                <span className="inline-flex items-center rounded-full border border-emerald-300/50 bg-emerald-50 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-700">AI</span>
              )}
              {prep?.source === 'heuristic' && (
                <span className="inline-flex items-center rounded-full border border-amber-300/50 bg-amber-50 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-700">Heuristic</span>
              )}
            </p>
            <h2 className="mt-1 font-display text-lg font-semibold tracking-tight text-valence-text truncate">
              {meeting?.title || 'Untitled meeting'}
            </h2>
            <p className="mt-0.5 text-[11px] text-valence-muted">
              {meeting?.time && <>at {meeting.time} · </>}
              with {meeting?.attendee_name || 'unknown counterparty'}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={copyAll} disabled={!prep} className="vl-btn-ghost" aria-label="Copy">
              {copied ? <Check className="h-4 w-4 text-valence-success" /> : <Copy className="h-4 w-4" />}
            </button>
            <button onClick={onClose} className="vl-btn-ghost -mr-2" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-valence-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Pulling persona, recent interactions, open mandates…
            </div>
          )}
          {error && (
            <p className="rounded-lg border border-valence-danger/30 bg-valence-danger/10 px-3 py-2 text-[12px] text-valence-danger">{error}</p>
          )}

          {prep && !loading && (
            <>
              {/* The summary line */}
              <div className="rounded-xl border border-valence-blue/20 bg-valence-blue-soft/40 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-valence-blue">60-second read</p>
                <p className="mt-1.5 text-[14px] leading-relaxed text-valence-text">{prep.summary || 'No prep yet — log an interaction first.'}</p>
              </div>

              {/* Persona */}
              {prep.people[0] && (
                <Section icon={User2} title="Persona" tone="violet">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-valence-text">
                      {prep.people[0].full_name}
                      <span className="ml-2 text-[11px] text-valence-muted font-normal">
                        {[prep.people[0].role, prep.people[0].company].filter(Boolean).join(' · ')}
                      </span>
                    </p>
                    {prep.people[0].how_to_talk && <FieldLine label="How to talk" value={prep.people[0].how_to_talk} />}
                    {prep.people[0].what_they_care_about && <FieldLine label="Cares about" value={prep.people[0].what_they_care_about} />}
                    {prep.people[0].mutuals?.length > 0 && <FieldLine label="Mutuals" value={prep.people[0].mutuals.join(', ')} />}
                    <div className="pt-1">
                      <Link to={`/people?open=${prep.people[0].id}`} onClick={onClose} className="inline-flex items-center gap-1 text-[11px] font-semibold text-valence-blue hover:text-valence-blue/80">
                        Open profile <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                </Section>
              )}

              {/* Talking points */}
              {prep.talkingPoints.length > 0 && (
                <Section icon={Target} title="Talking points" tone="emerald">
                  <ol className="space-y-1.5">
                    {prep.talkingPoints.map((t, i) => (
                      <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed text-valence-text">
                        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white text-[9px] font-bold tabular-nums">{i + 1}</span>
                        <span>{t}</span>
                      </li>
                    ))}
                  </ol>
                </Section>
              )}

              {/* Last interactions */}
              {prep.interactions.length > 0 && (
                <Section icon={MessageSquare} title="Recent interactions" tone="blue">
                  <ul className="space-y-2">
                    {prep.interactions.map(i => (
                      <li key={i.id} className="rounded-lg border border-valence-border bg-white px-3 py-2">
                        <div className="flex items-center justify-between gap-2 text-[11px] text-valence-muted">
                          <span className="font-semibold text-valence-text">{labelType(i.type)} · {labelOutcome(i.outcome)}</span>
                          <span>{i.created_at?.slice(0, 10)}</span>
                        </div>
                        {i.notes && <p className="mt-1 text-[12.5px] leading-relaxed text-valence-text/90 line-clamp-3">{i.notes}</p>}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {/* Mandates */}
              {prep.deals.length > 0 && (
                <Section icon={Briefcase} title="Open mandates" tone="amber">
                  <ul className="space-y-1.5">
                    {prep.deals.map(d => (
                      <li key={d.id} className="flex items-center justify-between gap-3 rounded-lg border border-valence-border bg-white px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="font-semibold text-valence-text truncate">{d.client_name}</p>
                          <p className="text-[10.5px] text-valence-muted">{[d.stage, d.sector, d.deal_type].filter(Boolean).join(' · ')}</p>
                        </div>
                        <Link to={`/deals?open=${d.id}`} onClick={onClose} className="vl-btn-ghost text-[11px] shrink-0">
                          Open <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {prep.people.length === 0 && prep.interactions.length === 0 && prep.deals.length === 0 && (
                <div className="rounded-lg border border-dashed border-valence-border bg-valence-surface px-5 py-6 text-center text-[12px] text-valence-muted">
                  Nothing on file for this counterparty yet. After the meeting, log it under <Link to="/interactions" onClick={onClose} className="text-valence-blue hover:underline">Interactions</Link> — the next prep will be sharper.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const TONES = {
  blue:    { iconBg: 'bg-valence-blue-soft text-valence-blue',  ring: 'ring-valence-blue/20',      eyebrow: 'text-valence-blue'  },
  violet:  { iconBg: 'bg-violet-50 text-violet-700',            ring: 'ring-violet-300/40',        eyebrow: 'text-violet-700'    },
  emerald: { iconBg: 'bg-emerald-50 text-emerald-700',          ring: 'ring-emerald-300/40',       eyebrow: 'text-emerald-700'   },
  amber:   { iconBg: 'bg-amber-50 text-amber-700',              ring: 'ring-amber-300/40',         eyebrow: 'text-amber-700'     }
}

function Section({ icon: Icon, title, tone = 'blue', children }) {
  const t = TONES[tone] || TONES.blue
  return (
    <div className={`rounded-xl border border-valence-border bg-white p-4 ring-1 ${t.ring}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${t.iconBg}`}><Icon className="h-3.5 w-3.5" /></span>
        <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${t.eyebrow}`}>{title}</p>
      </div>
      {children}
    </div>
  )
}

function FieldLine({ label, value }) {
  return (
    <p className="text-[12.5px] leading-relaxed text-valence-text/90">
      <span className="font-semibold text-valence-text">{label}: </span>
      <span className="text-valence-muted">{value}</span>
    </p>
  )
}

function labelType(t)    { return String(t || 'interaction').replace(/_/g, ' ') }
function labelOutcome(o) { return String(o || '').replace(/_/g, ' ') }
