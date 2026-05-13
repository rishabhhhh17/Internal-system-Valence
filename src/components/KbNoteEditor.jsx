import { useEffect, useRef, useState } from 'react'
import { Loader2, Check, AtSign, Hash, Mic, Sparkles, FileAudio, Trash2, Link as LinkIcon, FileText } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { parseTags, syncMentions, renderMentionToken, embedNote, fetchBacklinks } from '../lib/kb.js'
import { uploadVoiceMemo, transcribeAndSummarise } from '../lib/voiceMemo.js'
import { isGeminiConfigured } from '../lib/gemini.js'
import { useToast } from './Toast.jsx'
import WikilinkTextarea from './WikilinkTextarea.jsx'

// Note editor — title + body. The body is a wikilink-aware contentEditable
// (same component used by the homepage Daily Note) so [[person:uuid|Name]]
// tokens render as inline pills instead of leaking the raw token text into
// view after the user picks an entity.
//
// Body convention:
//   [[type:id|name]]  (global wikilink — autocompletes from People / Funds / Mandates / Notes)
//   #tag              (folder-local tag, harvested into kb_notes.tags)
//
// The contentEditable serialises back to canonical [[type:id|name]] form for
// storage so backlinks / search / KbNoteView keep working without any
// downstream change.

export default function KbNoteEditor({ note, folder, onSaved }) {
  const toast = useToast()
  const [title, setTitle]     = useState('')
  const [body,  setBody]      = useState('')
  const [saving, setSaving]   = useState(false)
  const [savedAt, setSavedAt] = useState(0)

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

      {/* Inline hints: linking and tags. No markdown toolbar — typing [[ opens
          the entity picker, picking inserts a pill in-place. */}
      <div className="flex items-center gap-3 border-b border-valence-border pb-1.5 text-[10px] text-valence-subtle">
        <span className="inline-flex items-center gap-1" title="Link a person, fund, mandate or note">
          <AtSign className="h-3 w-3" /> <span className="vl-kbd">[[</span> link
        </span>
        <span className="inline-flex items-center gap-1" title="Folder-local tag, harvested into kb_notes.tags">
          <Hash className="h-3 w-3" /> <span className="vl-kbd">#</span> tag
        </span>
      </div>

      {/* Body — same editor as the homepage Daily Note. Pills render inline,
          [[type:id|name]] tokens stay in the saved string for search. */}
      <WikilinkTextarea
        value={body}
        onChange={setBody}
        placeholder="Write the note. Type [[ to link a person / fund / mandate. Use #tag for folder-local tags."
        className="vl-input min-h-[280px] leading-relaxed text-[13px] bg-white"
      />

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

// Read-only renderer that swaps [[type:id|name]] tokens for live entity
// names from the lookups map. Used by entity Mentions tabs and any other
// surface that displays a saved note body without the editor.
export function renderNoteBody(body, lookups) {
  if (!body) return ''
  return body.replace(/\[\[(person|fund|mandate|note):([^|\]]+)(?:\|([^\]]+))?\]\]/gi, (_, type, id, fallback) => {
    return renderMentionToken(type.toLowerCase(), id.toLowerCase(), lookups) || fallback || `${type}:${String(id).slice(0, 8)}`
  })
}
