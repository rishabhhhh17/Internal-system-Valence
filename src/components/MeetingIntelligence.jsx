import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { Sparkles, Upload, FileText, Quote, AlertTriangle, ListChecks, Search, RotateCcw } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { extractText } from '../lib/fileParse.js'
import { extractMeetingIntelligence, TRANSCRIPT_SOURCES } from '../lib/meetingIntel.js'
import { isGeminiConfigured } from '../lib/gemini.js'
import { humanError } from '../lib/userError.js'
import { useToast } from './Toast.jsx'

export default function MeetingIntelligence({ deal }) {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [transcript, setTranscript] = useState('')
  const [source, setSource] = useState('manual')
  const [parsing, setParsing] = useState(false)
  const [running, setRunning] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!deal?.id) return
    if (!isSupabaseConfigured) { setItems([]); setLoading(false); return }
    ;(async () => {
      setLoading(true)
      const { data } = await supabase.from('meeting_intelligence').select('*').eq('deal_id', deal.id).order('created_at', { ascending: false })
      setItems(data || [])
      setLoading(false)
    })()
  }, [deal?.id])

  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setParsing(true)
    try {
      const { text } = await extractText(file)
      setTranscript(text || '')
      toast.success('Transcript loaded')
    } catch (err) {
      toast.error(humanError(err, 'Could not parse file'))
    } finally {
      setParsing(false)
    }
  }

  async function run() {
    if (!transcript.trim()) return toast.error('Paste or upload a transcript first')
    setRunning(true)
    try {
      const extracted = await extractMeetingIntelligence({ deal, transcript })
      const payload = {
        deal_id: deal.id,
        source,
        transcript_text: transcript.slice(0, 60000),
        ...extracted
      }
      if (!isSupabaseConfigured) {
        setItems(prev => [{ id: `local-${Date.now()}`, created_at: new Date().toISOString(), ...payload }, ...prev])
      } else {
        const { data, error } = await supabase.from('meeting_intelligence').insert(payload).select().single()
        if (error) throw error
        setItems(prev => [data, ...prev])
      }
      setTranscript('')
      toast.success('Meeting brief saved')
    } catch (err) {
      toast.error(humanError(err, 'Could not extract meeting brief'))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="vl-eyebrow-ink">Meeting intelligence</p>
        <p className="text-[11px] text-valence-muted mt-0.5">
          Paste a transcript from Otter, Fireflies, Granola — or upload a PDF / DOCX. The model extracts founder highlights, red flags, claims to verify, and action items.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-valence-border bg-valence-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="vl-eyebrow-ink">Source</span>
          {TRANSCRIPT_SOURCES.map(s => (
            <button key={s.id} onClick={() => setSource(s.id)} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${source === s.id ? 'border-valence-blue/40 bg-valence-blue-soft text-valence-text' : 'border-valence-border bg-valence-elevated text-valence-muted hover:text-valence-text'}`}>{s.label}</button>
          ))}
        </div>
        <textarea
          value={transcript}
          onChange={e => setTranscript(e.target.value)}
          className="vl-input min-h-[180px] leading-relaxed bg-valence-elevated"
          placeholder="Paste the transcript here…"
        />
        <div className="flex flex-wrap items-center gap-3">
          <input ref={inputRef} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={onFile} />
          <button onClick={() => inputRef.current?.click()} disabled={parsing} className="vl-btn-secondary text-xs">
            <Upload className="h-3.5 w-3.5" /> {parsing ? 'Parsing…' : 'Upload PDF / DOCX'}
          </button>
          <span className="text-[11px] text-valence-muted">{Math.round(transcript.length / 100) / 10}k chars</span>
          <button onClick={run} disabled={running || !transcript.trim()} className="vl-btn-primary text-xs ml-auto">
            <Sparkles className="h-4 w-4" /> {running ? 'Extracting…' : 'Extract intelligence'}
          </button>
        </div>
        {!isGeminiConfigured && (
          <p className="text-[11px] text-valence-warning inline-flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" /> The assistant is offline — the transcript will be stored but extraction is skipped.
          </p>
        )}
      </div>

      {loading ? (
        <div className="rounded-lg border border-valence-border bg-valence-surface px-5 py-6 text-center text-sm text-valence-muted">Loading meeting briefs…</div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-valence-border bg-valence-surface px-5 py-6 text-center text-sm text-valence-muted">No meeting briefs on this mandate yet.</div>
      ) : (
        <ul className="space-y-4">
          {items.map(it => <BriefCard key={it.id} item={it} />)}
        </ul>
      )}
    </div>
  )
}

function BriefCard({ item }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <li className="rounded-xl border border-valence-border bg-valence-elevated p-4">
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className="inline-flex items-center gap-2 text-valence-muted">
          <FileText className="h-3 w-3" /> {item.source || 'manual'} · {item.created_at ? format(new Date(item.created_at), 'd MMM yyyy · HH:mm') : ''}
        </span>
        <button onClick={() => setExpanded(v => !v)} className="text-[11px] font-semibold text-valence-blue hover:text-valence-blue-hover inline-flex items-center gap-1">
          <RotateCcw className="h-3 w-3" /> {expanded ? 'Hide' : 'Show'} transcript
        </button>
      </div>

      {item.summary && <p className="mt-3 text-sm leading-relaxed text-valence-text">{item.summary}</p>}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <BriefList icon={Quote}        title="Founder highlights"  items={item.founder_highlights} tone="bg-valence-success/10 text-valence-success border-valence-success/30" />
        <BriefList icon={AlertTriangle} title="Red flags"           items={item.red_flags}          tone="bg-valence-danger/10 text-valence-danger border-valence-danger/30" />
        <BriefList icon={Search}        title="Claims to verify"    items={item.claims_to_verify}   tone="bg-valence-warning/10 text-valence-warning border-valence-warning/30" />
        <BriefList icon={ListChecks}    title="Action items"        items={item.action_items}       tone="bg-valence-blue-soft text-valence-blue border-valence-blue/30" />
      </div>

      {expanded && item.transcript_text && (
        <div className="mt-4 rounded-lg border border-valence-border bg-valence-surface p-3 max-h-72 overflow-y-auto text-[11px] leading-relaxed text-valence-muted whitespace-pre-wrap font-mono">
          {item.transcript_text}
        </div>
      )}
    </li>
  )
}

function BriefList({ icon: Icon, title, items, tone }) {
  if (!items || items.length === 0) return (
    <div>
      <p className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Icon className="h-3 w-3" /> {title}</p>
      <p className="mt-1 text-[11px] italic text-valence-subtle">— none —</p>
    </div>
  )
  return (
    <div>
      <p className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Icon className="h-3 w-3" /> {title}</p>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((s, i) => (
          <li key={i} className={`rounded-md border px-2 py-1.5 text-[12px] leading-snug ${tone}`}>{s}</li>
        ))}
      </ul>
    </div>
  )
}
