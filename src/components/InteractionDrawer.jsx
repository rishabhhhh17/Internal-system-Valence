import { useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles, UserCircle, Plus, FileText, Mic, Upload, Wand2, Trash2, Loader2, ExternalLink } from 'lucide-react'
import Drawer from './Drawer.jsx'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import {
  PURPOSES, CONTEXT_GROUPS, TYPES, outcomesForPurpose, outcomeLabel, purposeLabel
} from '../lib/interactions.js'
import { DEMO_PEOPLE } from '../lib/people.js'
import { extractText } from '../lib/fileParse.js'
import { transcribeAndSummarise } from '../lib/voiceMemo.js'
import { isGeminiConfigured } from '../lib/gemini.js'
import { useToast } from './Toast.jsx'
import WikilinkTextarea from './WikilinkTextarea.jsx'

const TRANSCRIPT_SOURCES = [
  { id: 'manual',     label: 'Paste / type',  icon: FileText, blurb: 'Type or paste a transcript directly' },
  { id: 'upload',     label: 'Upload file',   icon: Upload,   blurb: '.txt, .vtt, .srt, .docx, .pdf' },
  { id: 'voice_memo', label: 'Voice memo',    icon: Mic,      blurb: 'Audio → transcript via Gemini' },
  { id: 'fathom',     label: 'Pull from Fathom', icon: Sparkles, blurb: 'Latest meeting from your Fathom account' }
]

const BLANK = {
  interaction_purpose: 'pitch_for_mandate',
  type: 'intro_call',
  person_id: '',                 // FK to people; preferred path
  counterparty_name: '',         // free-text fallback if person_id unset
  counterparty_company: '',
  counterparty_role: '',
  outcome: 'to_followup',
  notes: '',
  follow_up_date: '',
  lead_owner: '',
  deal_id: '',
  // Phase 3.7 — transcript / audio fields
  transcript: '',
  transcript_summary: '',
  transcript_source: '',
  audio_url: '',
  audio_filename: '',
  external_ref: ''
}

export default function InteractionDrawer({ open, onClose, existing, onSubmit }) {
  const toast = useToast()
  const [form, setForm] = useState(BLANK)
  const [deals, setDeals] = useState([])
  const [people, setPeople] = useState([])
  const [personQuery, setPersonQuery] = useState('')
  const [creatingPerson, setCreatingPerson] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(existing ? { ...BLANK, ...normalize(existing) } : BLANK)
    setPersonQuery('')
  }, [open, existing])

  // Pull deal options for the optional "Linked deal" picker + people for autocomplete.
  useEffect(() => {
    if (!open) return
    if (!isSupabaseConfigured) {
      setPeople(DEMO_PEOPLE)
      return
    }
    ;(async () => {
      const [d, p] = await Promise.all([
        supabase.from('deals').select('id, client_name, stage').order('created_at', { ascending: false }).limit(200),
        supabase.from('people').select('id, full_name, role, company').order('full_name').limit(500)
      ])
      setDeals(d.data || [])
      setPeople(p.data || [])
    })()
  }, [open])

  // When the purpose changes, snap the outcome back to the first valid option.
  useEffect(() => {
    const allowed = outcomesForPurpose(form.interaction_purpose)
    if (allowed.length && !allowed.includes(form.outcome)) {
      setForm(f => ({ ...f, outcome: allowed[0] }))
    }
  }, [form.interaction_purpose])

  const allowedOutcomes = useMemo(() => outcomesForPurpose(form.interaction_purpose), [form.interaction_purpose])
  const purposeBlurb = PURPOSES.find(p => p.id === form.interaction_purpose)?.blurb

  function update(patch) { setForm(f => ({ ...f, ...patch })) }

  // The picker shows people whose name fuzzy-matches the typed query.
  const filteredPeople = useMemo(() => {
    const q = personQuery.trim().toLowerCase()
    if (!q) return []
    return people.filter(p =>
      (p.full_name || '').toLowerCase().includes(q) ||
      (p.company   || '').toLowerCase().includes(q)
    ).slice(0, 8)
  }, [people, personQuery])

  function pickPerson(p) {
    update({
      person_id: p.id,
      counterparty_name: p.full_name,
      counterparty_company: p.company || form.counterparty_company,
      counterparty_role: p.role || form.counterparty_role
    })
    setPersonQuery('')
  }

  function clearPerson() {
    update({ person_id: '' })
  }

  async function createPersonInline() {
    const name = personQuery.trim() || form.counterparty_name.trim()
    if (!name) return toast.error('Type a name first')
    setCreatingPerson(true)
    try {
      if (!isSupabaseConfigured) {
        const local = { id: `local-person-${Date.now()}`, full_name: name, company: form.counterparty_company || null, role: form.counterparty_role || null }
        setPeople(prev => [local, ...prev])
        pickPerson(local)
        return
      }
      const { data, error } = await supabase.from('people').insert({
        full_name: name,
        company:   form.counterparty_company || null,
        role:      form.counterparty_role    || null
      }).select().single()
      if (error) throw error
      setPeople(prev => [data, ...prev])
      pickPerson(data)
      toast.success(`${name} added to People`)
    } catch (err) {
      toast.error(err?.message || 'Could not create person')
    } finally {
      setCreatingPerson(false)
    }
  }

  function submit(e) {
    e.preventDefault()
    if (!form.counterparty_name.trim()) return
    const payload = {
      interaction_purpose: form.interaction_purpose,
      type: form.type,
      person_id: form.person_id || null,
      counterparty_name: form.counterparty_name.trim(),
      counterparty_company: form.counterparty_company.trim() || null,
      counterparty_role: form.counterparty_role.trim() || null,
      outcome: form.outcome,
      notes: form.notes.trim() || null,
      follow_up_date: form.follow_up_date || null,
      lead_owner: form.lead_owner.trim() || null,
      deal_id: form.deal_id || null,
      // Phase 3.7 — transcript / audio
      transcript: form.transcript?.trim() || null,
      transcript_summary: form.transcript_summary?.trim() || null,
      transcript_source: form.transcript?.trim() ? (form.transcript_source || 'manual') : null,
      audio_url: form.audio_url || null,
      audio_filename: form.audio_filename || null,
      transcribed_at: form.transcript?.trim() ? new Date().toISOString() : null,
      external_ref: form.external_ref || null
    }
    onSubmit?.(payload, existing?.id)
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={existing ? `Edit interaction · ${existing.counterparty_name}` : 'Log a new interaction'}
      footer={
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="vl-btn-secondary">Cancel</button>
          <button type="submit" form="interaction-form" className="vl-btn-primary">{existing ? 'Save changes' : 'Log interaction'}</button>
        </div>
      }
    >
      <form id="interaction-form" onSubmit={submit} className="space-y-5">
        <div>
          <label className="vl-label">Context</label>
          <p className="text-[11px] text-valence-subtle mb-2">What stage of the relationship is this touchpoint?</p>
          <div className="space-y-3">
            {CONTEXT_GROUPS.map(g => {
              const items = PURPOSES.filter(p => p.group === g.id)
              return (
                <div key={g.id}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-valence-subtle mb-1.5">{g.label}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {items.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => update({ interaction_purpose: p.id })}
                        className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                          form.interaction_purpose === p.id
                            ? 'border-valence-blue/40 bg-valence-blue-soft text-valence-text'
                            : 'border-valence-border bg-white text-valence-muted hover:text-valence-text'
                        }`}
                      >
                        <p className="font-semibold">{p.label}</p>
                        <p className="mt-0.5 text-[11px] leading-snug text-valence-subtle">{p.blurb}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          {purposeBlurb && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-valence-muted">
              <Sparkles className="h-3 w-3 text-valence-blue" /> Outcomes available: {allowedOutcomes.map(outcomeLabel).join(' · ')}
            </p>
          )}
        </div>

        {/* Person picker — typed search → dropdown → Create Person fallback */}
        <div className="rounded-xl border border-valence-border bg-valence-surface p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="vl-label inline-flex items-center gap-1.5"><UserCircle className="h-3.5 w-3.5 text-valence-blue" /> Counterparty</label>
            {form.person_id && (
              <button type="button" onClick={clearPerson} className="text-[11px] font-semibold text-valence-muted hover:text-valence-danger">Unlink person</button>
            )}
          </div>
          {form.person_id ? (
            <div className="rounded-lg border border-valence-blue/30 bg-white px-3 py-2.5 text-sm">
              <p className="font-semibold text-valence-text">{form.counterparty_name}</p>
              <p className="mt-0.5 text-[11px] text-valence-muted">{[form.counterparty_role, form.counterparty_company].filter(Boolean).join(' · ') || '—'}</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-valence-blue">Linked to People</p>
            </div>
          ) : (
            <div className="relative">
              <input
                className="vl-input bg-white"
                value={personQuery}
                onChange={e => { setPersonQuery(e.target.value); update({ counterparty_name: e.target.value }) }}
                placeholder="Search People CRM, or type a new name to add"
              />
              {filteredPeople.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-valence-border bg-white shadow-valence">
                  {filteredPeople.map(p => (
                    <li key={p.id}>
                      <button type="button" onClick={() => pickPerson(p)} className="block w-full px-3 py-2 text-left hover:bg-valence-blue-soft">
                        <p className="text-sm font-semibold text-valence-text">{p.full_name}</p>
                        <p className="text-[11px] text-valence-muted">{[p.role, p.company].filter(Boolean).join(' · ') || '—'}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {personQuery && filteredPeople.length === 0 && (
                <div className="mt-2 flex items-center justify-between rounded-lg border border-dashed border-valence-border bg-white px-3 py-2 text-xs text-valence-muted">
                  <span>No match for "{personQuery}".</span>
                  <button type="button" disabled={creatingPerson} onClick={createPersonInline} className="vl-btn-ghost text-[11px]">
                    <Plus className="h-3 w-3" /> {creatingPerson ? 'Adding…' : 'Create Person'}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="vl-label">Company</label>
              <input className="vl-input mt-1.5 bg-white" value={form.counterparty_company} onChange={e => update({ counterparty_company: e.target.value })} placeholder="Nimbus Health" />
            </div>
            <div>
              <label className="vl-label">Role</label>
              <input className="vl-input mt-1.5 bg-white" value={form.counterparty_role} onChange={e => update({ counterparty_role: e.target.value })} placeholder="CEO" />
            </div>
          </div>
          <div>
            <label className="vl-label">Lead owner</label>
            <input className="vl-input mt-1.5 bg-white" value={form.lead_owner} onChange={e => update({ lead_owner: e.target.value })} placeholder="Neha Jain" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="vl-label">Type</label>
            <select className="vl-input mt-1.5" value={form.type} onChange={e => update({ type: e.target.value })}>
              {TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="vl-label">Outcome</label>
            <select className="vl-input mt-1.5" value={form.outcome} onChange={e => update({ outcome: e.target.value })}>
              {allowedOutcomes.map(o => <option key={o} value={o}>{outcomeLabel(o)}</option>)}
            </select>
            <p className="mt-1.5 text-[11px] text-valence-muted">Outcomes scoped to {purposeLabel(form.interaction_purpose).toLowerCase()}.</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="vl-label">Follow-up date</label>
            <input type="date" className="vl-input mt-1.5" value={form.follow_up_date || ''} onChange={e => update({ follow_up_date: e.target.value })} />
          </div>
          <div>
            <label className="vl-label">Linked deal <span className="text-valence-subtle">(optional)</span></label>
            <select className="vl-input mt-1.5" value={form.deal_id || ''} onChange={e => update({ deal_id: e.target.value })}>
              <option value="">— None —</option>
              {deals.map(d => <option key={d.id} value={d.id}>{d.client_name} · {d.stage}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="vl-label flex items-center gap-2">
            Notes
            <span className="text-[10px] font-normal normal-case tracking-normal text-valence-muted">
              Type <span className="vl-kbd">[[</span> to link people / funds / mandates
            </span>
          </label>
          <WikilinkTextarea
            className="vl-input mt-1.5 min-h-[140px] leading-relaxed"
            value={form.notes}
            onChange={v => update({ notes: v })}
            placeholder="What was discussed, what was agreed, what's the next step…"
          />
        </div>

        <TranscriptSection form={form} update={update} />
      </form>
    </Drawer>
  )
}

// ============================================================================
// TranscriptSection — paste / upload / voice memo / Fathom pull. Stores into
// form.transcript + form.transcript_source. Optional Gemini summary is
// stored in form.transcript_summary. Audio (when voice-memo source) goes to
// form.audio_url + form.audio_filename via Supabase Storage.
// ============================================================================
function TranscriptSection({ form, update }) {
  const toast = useToast()
  const [picking, setPicking] = useState(form.transcript ? null : null)
  const [parsing, setParsing] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [summarising, setSummarising] = useState(false)
  const [pullingFathom, setPullingFathom] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)
  const fileRef = useRef(null)
  const audioRef = useRef(null)

  function clearTranscript() {
    update({ transcript: '', transcript_summary: '', transcript_source: '', audio_url: '', audio_filename: '', external_ref: '' })
    setShowTranscript(false)
  }

  async function onTranscriptFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setParsing(true)
    try {
      const { text } = await extractText(file)
      update({ transcript: text || '', transcript_source: 'upload', external_ref: file.name })
      setShowTranscript(true)
      toast.success(`Loaded transcript from ${file.name}`)
    } catch (err) {
      toast.error(err?.message || 'Could not read that file')
    } finally {
      setParsing(false)
      e.target.value = ''
    }
  }

  async function onAudioFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!isGeminiConfigured) {
      toast.error('Gemini key not set — voice-memo transcription is disabled until VITE_GEMINI_API_KEY arrives.')
      e.target.value = ''
      return
    }
    setTranscribing(true)
    try {
      const result = await transcribeAndSummarise(file, { context: `Interaction with ${form.counterparty_name || 'a counterparty'}` })
      update({
        transcript: result.transcript || '',
        transcript_summary: result.summary || '',
        transcript_source: 'voice_memo',
        audio_filename: file.name
      })
      setShowTranscript(true)
      toast.success('Transcribed via Gemini.')
    } catch (err) {
      toast.error(err?.message || 'Transcription failed')
    } finally {
      setTranscribing(false)
      e.target.value = ''
    }
  }

  async function pullFromFathom() {
    setPullingFathom(true)
    // Stub: real Fathom integration needs a Fathom API key + OAuth flow.
    // For now we surface a clear "not connected" message and tell the
    // user how to wire it. The schema column external_ref is reserved
    // for the Fathom meeting URL once the integration is real.
    setTimeout(() => {
      toast.info('Fathom integration not connected yet. Add a Fathom API key + an OAuth flow under Settings → Integrations to enable one-click pulls.')
      setPullingFathom(false)
    }, 500)
  }

  async function summarise() {
    if (!form.transcript?.trim()) return
    if (!isGeminiConfigured) {
      toast.error('Gemini key not set — summary disabled.')
      return
    }
    setSummarising(true)
    try {
      // Reuse the audio summariser since it accepts a transcript-shaped
      // text via context-only path. Simpler than a dedicated endpoint.
      const fakeFile = new Blob([form.transcript], { type: 'text/plain' })
      Object.defineProperty(fakeFile, 'name', { value: 'transcript.txt' })
      const result = await transcribeAndSummarise(fakeFile, { context: `Counterparty: ${form.counterparty_name || 'unknown'}. Already-transcribed text follows.` })
      update({ transcript_summary: result.summary || '' })
      toast.success('Summary generated.')
    } catch (err) {
      toast.error(err?.message || 'Summary failed')
    } finally {
      setSummarising(false)
    }
  }

  const hasTranscript = Boolean(form.transcript?.trim())

  return (
    <div className="rounded-xl border border-valence-border bg-valence-surface/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="vl-label !mb-0.5 inline-flex items-center gap-1.5"><FileText className="h-3 w-3" /> Transcript / recording</p>
          <p className="text-[11px] text-valence-muted">Optional — attach the artefact of the conversation.</p>
        </div>
        {hasTranscript && (
          <button type="button" onClick={clearTranscript} className="vl-btn-ghost text-[11px] text-valence-danger hover:bg-valence-danger/10">
            <Trash2 className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      {!hasTranscript && (
        <div className="grid grid-cols-2 gap-2">
          {TRANSCRIPT_SOURCES.map(s => {
            const Icon = s.icon
            const onClick = () => {
              if (s.id === 'manual')     { setShowTranscript(true); update({ transcript_source: 'manual' }) }
              else if (s.id === 'upload')     fileRef.current?.click()
              else if (s.id === 'voice_memo') audioRef.current?.click()
              else if (s.id === 'fathom')     pullFromFathom()
            }
            const busy = (s.id === 'upload' && parsing) || (s.id === 'voice_memo' && transcribing) || (s.id === 'fathom' && pullingFathom)
            return (
              <button
                key={s.id}
                type="button"
                onClick={onClick}
                disabled={busy}
                className="rounded-lg border border-valence-border bg-white px-3 py-2.5 text-left text-xs hover:border-valence-blue/40 hover:bg-valence-blue-soft transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-1.5 font-semibold text-valence-text">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5 text-valence-blue" />}
                  {s.label}
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-valence-muted">{s.blurb}</p>
              </button>
            )
          })}
          <input ref={fileRef}  type="file" accept=".txt,.vtt,.srt,.docx,.pdf" className="hidden" onChange={onTranscriptFile} />
          <input ref={audioRef} type="file" accept="audio/*"                   className="hidden" onChange={onAudioFile} />
        </div>
      )}

      {hasTranscript && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            {form.transcript_source && (
              <span className="vl-chip-blue">
                {form.transcript_source === 'voice_memo' ? <Mic className="h-3 w-3" /> :
                 form.transcript_source === 'upload'     ? <Upload className="h-3 w-3" /> :
                 form.transcript_source === 'fathom'     ? <Sparkles className="h-3 w-3" /> :
                                                           <FileText className="h-3 w-3" />}
                {form.transcript_source.replace('_', ' ')}
              </span>
            )}
            {form.audio_filename && <span className="vl-chip">{form.audio_filename}</span>}
            {form.external_ref   && <span className="vl-chip" title={form.external_ref}>{form.external_ref.length > 32 ? `${form.external_ref.slice(0, 32)}…` : form.external_ref}</span>}
            <button type="button" onClick={() => setShowTranscript(s => !s)} className="ml-auto text-[11px] font-semibold text-valence-blue hover:text-valence-blue-hover">
              {showTranscript ? 'Hide transcript' : `Show transcript (${form.transcript.length.toLocaleString()} chars)`}
            </button>
          </div>

          {showTranscript && (
            <textarea
              className="vl-input min-h-[160px] text-[12px] leading-relaxed font-mono"
              value={form.transcript}
              onChange={e => update({ transcript: e.target.value })}
              placeholder="Paste the transcript here…"
            />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={summarise}
              disabled={summarising || !isGeminiConfigured}
              className="vl-btn-secondary text-[11px] disabled:opacity-50 disabled:cursor-not-allowed"
              title={!isGeminiConfigured ? 'Gemini key not set' : 'Generate AI summary'}
            >
              {summarising ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
              {form.transcript_summary ? 'Re-summarise' : 'Generate summary'}
            </button>
            {!isGeminiConfigured && (
              <span className="text-[10px] text-valence-muted">Summary needs a Gemini key on Vercel</span>
            )}
          </div>

          {form.transcript_summary && (
            <div className="rounded-lg border border-valence-blue/30 bg-valence-blue-soft px-3 py-2.5 text-[12px] leading-relaxed text-valence-text whitespace-pre-wrap">
              <p className="vl-eyebrow-ink mb-1.5"><Sparkles className="h-3 w-3 inline mr-1 text-valence-blue" /> Summary</p>
              {form.transcript_summary}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function normalize(row) {
  return {
    ...row,
    follow_up_date: row.follow_up_date ? String(row.follow_up_date).slice(0, 10) : '',
    counterparty_company: row.counterparty_company || '',
    counterparty_role: row.counterparty_role || '',
    notes: row.notes || '',
    lead_owner: row.lead_owner || '',
    deal_id: row.deal_id || '',
    person_id: row.person_id || ''
  }
}
