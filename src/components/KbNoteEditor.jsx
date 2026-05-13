import { useEffect, useMemo, useRef, useState } from 'react'
import { Bold, Italic, List, Link2, Loader2, Check, AtSign, Hash, Mic, Sparkles, FileAudio, Trash2, Link as LinkIcon, FileText } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { parseTags, syncMentions, renderMentionToken, embedNote, fetchBacklinks } from '../lib/kb.js'
import { caretCoordinates } from '../lib/caretCoordinates.js'
import { uploadVoiceMemo, transcribeAndSummarise } from '../lib/voiceMemo.js'
import { isGeminiConfigured } from '../lib/gemini.js'
import { useToast } from './Toast.jsx'

// Note editor — title + textarea body + small toolbar.
// Body uses a minimal markdown-ish convention:
//   **bold**          /  *italic*
//   - line            (bulleted list)
//   [text](url)       (link)
//   [[type:id|name]]  (global wikilink — autocompletes from People / Funds / Mandates)
//   #tag              (folder-local tag, harvested into kb_notes.tags)
//
// We deliberately do not ship a markdown live preview. The textarea is the
// editor and the source. A read-only renderer (KbNoteView) shows the same
// body with tokens swapped for live entity names + click-through links.

export default function KbNoteEditor({ note, folder, onSaved }) {
  const toast = useToast()
  const [title, setTitle]     = useState('')
  const [body,  setBody]      = useState('')
  const [saving, setSaving]   = useState(false)
  const [savedAt, setSavedAt] = useState(0)

  // Wikilink autocomplete state
  const textareaRef = useRef(null)
  const [linkOpen, setLinkOpen]     = useState(false)
  const [linkQuery, setLinkQuery]   = useState('')
  const [linkAnchor, setLinkAnchor] = useState(0)
  const [pickerPos, setPickerPos]   = useState({ top: 0, left: 0, flipUp: false })
  const [entities, setEntities]     = useState({ people: [], funds: [], mandates: [], notes: [] })

  // Backlinks — other notes that wikilink to this one.
  const [backlinks, setBacklinks]   = useState([])
  const [backlinksLoading, setBacklinksLoading] = useState(false)

  // Voice memo state — pulled fresh whenever the note changes.
  const [audioUrl, setAudioUrl]                 = useState('')
  const [audioFilename, setAudioFilename]       = useState('')
  const [transcript, setTranscript]             = useState('')
  const [transcriptSummary, setTranscriptSummary] = useState('')
  const [recording, setRecording]               = useState(false)
  const [transcribing, setTranscribing]         = useState(false)
  const [uploading, setUploading]               = useState(false)
  const recorderRef = useRef(null)
  const audioInputRef = useRef(null)

  // Reset form when the note prop changes.
  useEffect(() => {
    setTitle(note?.title || '')
    setBody(note?.body  || '')
    setAudioUrl(note?.audio_url || '')
    setAudioFilename(note?.audio_filename || '')
    setTranscript(note?.transcript || '')
    setTranscriptSummary(note?.transcript_summary || '')
    setSavedAt(0)
  }, [note?.id])

  // Pull entity universe for the [[autocomplete. People + Funds + Mandates +
  // other KB notes. Notes are sorted by recency so the picker leads with the
  // ones the user most likely wants to link.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setEntities({ people: [], funds: [], mandates: [], notes: [] })
      return
    }
    ;(async () => {
      const [p, f, d, n] = await Promise.all([
        supabase.from('people').select('id, full_name, company').limit(500),
        supabase.from('funds').select('id, name, fund_type').limit(500),
        supabase.from('deals').select('id, client_name, stage').limit(500),
        supabase.from('kb_notes').select('id, title').order('updated_at', { ascending: false }).limit(500)
      ])
      setEntities({
        people:   p.data || [],
        funds:    f.data || [],
        mandates: d.data || [],
        notes:    n.data || []
      })
    })()
  }, [])

  // Backlinks — reload whenever we switch notes. Also re-fetched after every
  // save so a new self-cross-link from another note shows up without reload.
  // savedAt is included as a dep so the panel refreshes after auto-save.
  useEffect(() => {
    if (!note?.id || !isSupabaseConfigured) { setBacklinks([]); return }
    let cancelled = false
    setBacklinksLoading(true)
    fetchBacklinks(supabase, note.id)
      .then(rows => { if (!cancelled) setBacklinks(rows) })
      .finally(() => { if (!cancelled) setBacklinksLoading(false) })
    return () => { cancelled = true }
  }, [note?.id, savedAt])

  // Debounced auto-save. 700 ms of idle and we save.
  useEffect(() => {
    if (!note || saving) return
    if (title === note.title && body === note.body) return
    const t = setTimeout(() => save(), 700)
    return () => clearTimeout(t)
  }, [title, body])

  async function save() {
    if (!note || saving) return
    if (!title.trim()) return
    setSaving(true)
    try {
      const tags = parseTags(body)
      if (!isSupabaseConfigured) {
        // Demo mode: just bubble up the new state via onSaved.
        onSaved?.({ ...note, title, body, tags })
        setSavedAt(Date.now())
        return
      }
      const { error } = await supabase.from('kb_notes').update({
        title: title.trim(),
        body,
        tags,
        updated_at: new Date().toISOString()
      }).eq('id', note.id)
      if (error) throw error
      // Sync wikilink mentions + refresh embedding in the background.
      // Neither blocks save; both fail silently to console on error.
      try { await syncMentions(supabase, note.id, body) } catch (e) { console.warn('mentions sync failed', e) }
      try { await embedNote(supabase, { id: note.id, title, body, transcript: note.transcript }) } catch (e) { console.warn('embed failed', e) }
      onSaved?.({ ...note, title, body, tags })
      setSavedAt(Date.now())
    } catch (err) {
      toast.error(err?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ---------- Voice memo: record / upload / transcribe / remove ----------
  // Persist audio metadata to Supabase. Reused after upload + after transcribe.
  async function persistAudioFields(patch) {
    if (!note || !isSupabaseConfigured) return
    const { error } = await supabase.from('kb_notes').update(patch).eq('id', note.id)
    if (error) toast.error(error.message)
    else onSaved?.({ ...note, ...patch })
  }

  async function startRecording() {
    if (recording) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      const chunks = []
      rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
        const file = new File([blob], `voice-memo-${Date.now()}.webm`, { type: blob.type })
        await handleAudioFile(file)
      }
      recorderRef.current = rec
      rec.start()
      setRecording(true)
    } catch (err) {
      toast.error(err?.message || 'Could not access the microphone')
    }
  }

  function stopRecording() {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
    setRecording(false)
  }

  async function handleAudioFile(file) {
    if (!note?.id) return toast.error('Save the note first')
    if (!isSupabaseConfigured) {
      // Demo: keep an object URL in memory; nothing persists.
      setAudioUrl(URL.createObjectURL(file))
      setAudioFilename(file.name)
      return
    }
    setUploading(true)
    try {
      const { url, filename } = await uploadVoiceMemo(note.id, file)
      setAudioUrl(url || '')
      setAudioFilename(filename || file.name)
      // Reset transcript whenever the audio changes.
      setTranscript('')
      setTranscriptSummary('')
      await persistAudioFields({
        audio_url: url, audio_filename: filename,
        transcript: null, transcript_summary: null, transcribed_at: null
      })
    } catch (err) {
      toast.error(err?.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function transcribeNow() {
    if (!audioUrl) return toast.error('Upload an audio file first')
    if (!isGeminiConfigured) return toast.error('Gemini key not set — transcription unavailable')
    setTranscribing(true)
    try {
      const res = await fetch(audioUrl)
      const blob = await res.blob()
      const file = new File([blob], audioFilename || 'memo.webm', { type: blob.type })
      const { transcript: t, summary } = await transcribeAndSummarise(file, { context: title })
      setTranscript(t || '')
      setTranscriptSummary(summary || '')
      await persistAudioFields({
        transcript: t || null,
        transcript_summary: summary || null,
        transcribed_at: new Date().toISOString()
      })
      toast.success('Transcribed')
    } catch (err) {
      toast.error(err?.message || 'Transcription failed')
    } finally {
      setTranscribing(false)
    }
  }

  async function removeAudio() {
    if (!confirm('Remove the voice memo from this note?')) return
    setAudioUrl(''); setAudioFilename('')
    setTranscript(''); setTranscriptSummary('')
    if (note && isSupabaseConfigured) {
      await persistAudioFields({
        audio_url: null, audio_filename: null,
        transcript: null, transcript_summary: null, transcribed_at: null
      })
    }
  }

  // Wraps the current selection with the given prefix/suffix (e.g. ** for bold).
  function wrap(prefix, suffix = prefix) {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end   = ta.selectionEnd
    const next  = body.slice(0, start) + prefix + body.slice(start, end) + suffix + body.slice(end)
    setBody(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(start + prefix.length, end + prefix.length)
    })
  }

  function insertBullet() {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const before = body.slice(0, start)
    const lineStart = before.lastIndexOf('\n') + 1
    const next = body.slice(0, lineStart) + '- ' + body.slice(lineStart)
    setBody(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(start + 2, start + 2)
    })
  }

  // Listen for [[ to trigger autocomplete and # for tag hint surfaces.
  // Picker anchors to the measured caret position via caretCoordinates so it
  // appears under the line being typed instead of at the textarea's bottom.
  function onBodyChange(e) {
    const value = e.target.value
    setBody(value)

    const ta = e.target
    const cursor = ta.selectionStart
    const before = value.slice(0, cursor)
    const lastOpen = before.lastIndexOf('[[')
    const lastClose = before.lastIndexOf(']]')
    if (lastOpen > lastClose) {
      const inner = before.slice(lastOpen + 2)
      if (!inner.includes('\n')) {
        const coords = caretCoordinates(ta, lastOpen)
        const top  = coords.top  + coords.lineHeight - ta.scrollTop + 4
        const left = coords.left - ta.scrollLeft
        const taRect = ta.getBoundingClientRect()
        const flipUp = (taRect.top + top + 280) > (window.innerHeight - 12)
        setPickerPos({ top: flipUp ? coords.top - ta.scrollTop - 8 : top, left, flipUp })
        setLinkOpen(true)
        setLinkQuery(inner)
        setLinkAnchor(lastOpen)
        return
      }
    }
    setLinkOpen(false)
  }

  // Filter entities by the typed [[query]]. Cap at 12 total.
  // Notes that match the current note are filtered out — no self-links.
  const linkSuggestions = useMemo(() => {
    const q = linkQuery.trim().toLowerCase()
    if (!linkOpen) return []
    const notesPool = (entities.notes || []).filter(n => n.id !== note?.id)
    const out = []
    if (!q) {
      // Show recent entities: top 3 of each kind, prefixed with their type label.
      out.push(...entities.people.slice(0, 3).map(p => ({ type: 'person',  id: p.id, label: p.full_name, sub: p.company })))
      out.push(...entities.funds.slice(0, 3).map(f  => ({ type: 'fund',    id: f.id, label: f.name,      sub: f.fund_type })))
      out.push(...entities.mandates.slice(0, 3).map(m => ({ type: 'mandate', id: m.id, label: m.client_name, sub: m.stage })))
      out.push(...notesPool.slice(0, 3).map(n => ({ type: 'note', id: n.id, label: n.title || 'Untitled note', sub: 'note' })))
      return out.slice(0, 12)
    }
    for (const p of entities.people)   if (p.full_name?.toLowerCase().includes(q))   out.push({ type: 'person',  id: p.id, label: p.full_name, sub: p.company })
    for (const f of entities.funds)    if (f.name?.toLowerCase().includes(q))        out.push({ type: 'fund',    id: f.id, label: f.name,      sub: f.fund_type })
    for (const m of entities.mandates) if (m.client_name?.toLowerCase().includes(q)) out.push({ type: 'mandate', id: m.id, label: m.client_name, sub: m.stage })
    for (const n of notesPool)         if (n.title?.toLowerCase().includes(q))       out.push({ type: 'note',    id: n.id, label: n.title,      sub: 'note' })
    return out.slice(0, 12)
  }, [linkOpen, linkQuery, entities, note?.id])

  // Pick a suggestion → splice [[type:id|label]] into the body where the [[ started.
  function pickLink(s) {
    const ta = textareaRef.current
    if (!ta) return
    const before = body.slice(0, linkAnchor)
    const after  = body.slice(ta.selectionStart)
    const token  = `[[${s.type}:${s.id}|${s.label}]]`
    const next   = before + token + after
    setBody(next)
    setLinkOpen(false)
    requestAnimationFrame(() => {
      ta.focus()
      const pos = (before + token).length
      ta.setSelectionRange(pos, pos)
    })
  }

  if (!note) return (
    <div className="rounded-lg border border-dashed border-valence-border bg-valence-surface px-5 py-12 text-center text-sm text-valence-muted">
      Select a note to start writing — or use the "+ Note" button to create one in this folder.
    </div>
  )

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Untitled note"
          className="flex-1 bg-transparent text-lg font-semibold tracking-tight text-valence-text outline-none placeholder:text-valence-subtle"
        />
        <span className="text-[10px] text-valence-subtle inline-flex items-center gap-1 shrink-0">
          {saving ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving</>
            : savedAt ? <><Check className="h-3 w-3 text-valence-success" /> Saved</>
            : null}
        </span>
      </div>

      {/* Toolbar — icons only. Inline helper text moved into the placeholder. */}
      <div className="flex items-center gap-0.5 border-b border-valence-border pb-1.5">
        <ToolbarBtn onClick={() => wrap('**')} title="Bold"><Bold className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => wrap('*')}  title="Italic"><Italic className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={insertBullet}     title="Bullet"><List className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => wrap('[', '](https://)')} title="Link"><Link2 className="h-3.5 w-3.5" /></ToolbarBtn>
        <span className="ml-auto text-[10px] text-valence-subtle inline-flex items-center gap-1" title="Type [[ to link a person, fund, or mandate · #tag for folder-local tags">
          <AtSign className="h-3 w-3" /><span className="vl-kbd">[[</span>
          <Hash className="h-3 w-3 ml-2" /><span className="vl-kbd">#</span>
        </span>
      </div>

      {/* Editor */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={onBodyChange}
          placeholder="Write the note. Type [[ to link a person / fund / mandate. Use #tag for folder-local tags."
          className="vl-input min-h-[280px] leading-relaxed font-mono text-[13px] bg-white"
        />

        {linkOpen && linkSuggestions.length > 0 && (
          <ul
            style={{ top: pickerPos.top, left: pickerPos.left, transform: pickerPos.flipUp ? 'translateY(-100%)' : 'none' }}
            className="absolute z-30 w-72 max-h-64 overflow-y-auto rounded-lg border border-valence-border bg-white shadow-valence"
          >
            {linkSuggestions.map(s => (
              <li key={`${s.type}-${s.id}`}>
                <button onMouseDown={e => e.preventDefault()} onClick={() => pickLink(s)} className="block w-full px-3 py-2 text-left hover:bg-valence-blue-soft">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-valence-blue">{s.type}</p>
                  <p className="text-sm font-semibold text-valence-text">{s.label}</p>
                  {s.sub && <p className="text-[11px] text-valence-muted">{s.sub}</p>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Voice memo block */}
      <div className="rounded-xl border border-valence-border bg-valence-surface p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Mic className="h-3 w-3 text-valence-blue" /> Voice memo</p>
          <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleAudioFile(f) }} />
        </div>

        {audioUrl ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-valence-border bg-white px-3 py-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <FileAudio className="h-3.5 w-3.5 text-valence-blue shrink-0" />
                <span className="truncate text-xs font-semibold text-valence-text">{audioFilename || 'Voice memo'}</span>
              </div>
              <audio src={audioUrl} controls className="h-8" />
              <button onClick={removeAudio} className="grid h-7 w-7 place-items-center rounded text-valence-subtle hover:text-valence-danger" title="Remove">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              {!transcript && (
                <button onClick={transcribeNow} disabled={transcribing || !isGeminiConfigured} className="vl-btn-primary text-xs">
                  {transcribing ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Transcribing…</> : <><Sparkles className="h-3.5 w-3.5" /> Transcribe & summarise</>}
                </button>
              )}
              {!isGeminiConfigured && (
                <span className="text-[11px] text-valence-warning">Add VITE_GEMINI_API_KEY to enable transcription.</span>
              )}
            </div>
            {transcriptSummary && (
              <div className="rounded-lg border border-valence-blue/30 bg-valence-blue-soft/30 px-3 py-2.5">
                <p className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Sparkles className="h-3 w-3 text-valence-blue" /> Summary</p>
                <p className="mt-1 text-sm leading-relaxed text-valence-text">{transcriptSummary}</p>
              </div>
            )}
            {transcript && (
              <details className="rounded-lg border border-valence-border bg-white">
                <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-valence-muted hover:text-valence-text">View transcript ({Math.round(transcript.length / 100) / 10}k chars)</summary>
                <div className="px-3 pb-3 text-[12px] leading-relaxed text-valence-muted whitespace-pre-wrap font-mono">{transcript}</div>
              </details>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {!recording ? (
              <button onClick={startRecording} disabled={uploading} className="vl-btn-secondary text-xs">
                <Mic className="h-3.5 w-3.5" /> Record
              </button>
            ) : (
              <button onClick={stopRecording} className="inline-flex items-center gap-1.5 rounded-lg border border-valence-danger/40 bg-valence-danger/10 px-3 py-1.5 text-xs font-semibold text-valence-danger">
                <span className="h-2 w-2 rounded-full bg-valence-danger animate-pulse" /> Stop recording
              </button>
            )}
            <button onClick={() => audioInputRef.current?.click()} disabled={uploading} className="vl-btn-secondary text-xs">
              <FileAudio className="h-3.5 w-3.5" /> {uploading ? 'Uploading…' : 'Upload audio'}
            </button>
            <span className="text-[11px] text-valence-muted">Audio is stored as-is. Transcription only runs when you click the button.</span>
          </div>
        )}
      </div>

      {/* Tag preview pulled from the body */}
      {parseTags(body).length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="vl-eyebrow-ink inline-flex items-center gap-1.5"><Hash className="h-3 w-3" /> Folder tags</span>
          {parseTags(body).map(t => (
            <span key={t} className="rounded-full border border-valence-border bg-valence-surface px-2 py-0.5 text-[10px] font-semibold text-valence-muted">#{t}</span>
          ))}
          <span className="text-[10px] text-valence-subtle">— scoped to this folder; won't leak to other mandates</span>
        </div>
      )}

      {/* Backlinks — every other note that wikilinks to this one. */}
      <BacklinksPanel loading={backlinksLoading} rows={backlinks} />
    </div>
  )
}

// Sidebar-style "Linked from" block under the editor. Hidden when there are
// no backlinks so the surface stays quiet for fresh notes.
function BacklinksPanel({ loading, rows }) {
  if (loading) {
    return (
      <div className="mt-2 rounded-xl border border-valence-border bg-valence-surface px-4 py-3">
        <p className="vl-eyebrow-ink inline-flex items-center gap-1.5"><LinkIcon className="h-3 w-3 text-valence-blue" /> Linked from</p>
        <p className="mt-1 text-[11px] text-valence-muted inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</p>
      </div>
    )
  }
  if (!rows || rows.length === 0) return null

  return (
    <div className="mt-2 rounded-xl border border-valence-border bg-valence-surface p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="vl-eyebrow-ink inline-flex items-center gap-1.5"><LinkIcon className="h-3 w-3 text-valence-blue" /> Linked from</p>
        <span className="text-[10px] tabular-nums text-valence-muted">{rows.length} note{rows.length === 1 ? '' : 's'}</span>
      </div>
      <ul className="divide-y divide-valence-border/60">
        {rows.map(r => (
          <li key={r.id} className="py-2 first:pt-0 last:pb-0">
            <div className="flex items-start gap-2">
              <FileText className="h-3.5 w-3.5 mt-0.5 text-valence-subtle shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-valence-text truncate">{r.title || 'Untitled note'}</p>
                <p className="mt-0.5 text-[11px] text-valence-muted">
                  <span className="font-semibold text-valence-text">{r.mandateName}</span>
                  {r.folderName ? <> · {r.folderName}</> : null}
                  {r.updated_at ? <> · updated {formatDistanceToNow(new Date(r.updated_at), { addSuffix: true })}</> : null}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ToolbarBtn({ onClick, title, children }) {
  return (
    <button type="button" onClick={onClick} title={title} className="grid h-7 w-7 place-items-center rounded text-valence-muted hover:bg-valence-surface hover:text-valence-text transition">
      {children}
    </button>
  )
}

// Read-only renderer that swaps [[type:id|name]] tokens for live entity
// names from the lookups map. Used by entity Mentions tabs and any other
// surface that displays a saved note body without the editor.
export function renderNoteBody(body, lookups) {
  if (!body) return ''
  return body.replace(/\[\[(person|fund|mandate|note):([0-9a-f-]{36})(?:\|([^\]]+))?\]\]/gi, (_, type, id, fallback) => {
    return renderMentionToken(type.toLowerCase(), id.toLowerCase(), lookups) || fallback || `${type}:${id.slice(0, 8)}`
  })
}
