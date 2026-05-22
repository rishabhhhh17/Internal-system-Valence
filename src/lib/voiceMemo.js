// Voice memo helpers: upload to Supabase Storage, transcribe + summarise
// with Gemini on demand. Audio is stored as-is; transcription only runs
// when the user clicks the button.

import { supabase, isSupabaseConfigured } from './supabase.js'
import { llmCallRaw } from './gemini.js'

const BUCKET = 'kb-voice-memos'

// Read a Blob/File as base64 (for inline_data in Gemini requests).
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result || ''
      // FileReader gives "data:<mime>;base64,<b64>" — strip the prefix.
      const idx = String(result).indexOf(',')
      resolve(idx >= 0 ? String(result).slice(idx + 1) : String(result))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

// Upload an audio file to Supabase Storage and return its public URL.
// Caller is responsible for writing the URL onto kb_notes.audio_url.
export async function uploadVoiceMemo(noteId, file) {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured')
  if (!file)                  throw new Error('No file selected')
  const safeName = (file.name || `memo-${Date.now()}.webm`).replace(/[^A-Za-z0-9._-]+/g, '_')
  const path = `note-${noteId}/${Date.now()}-${safeName}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || 'audio/webm'
  })
  if (error) throw error
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { url: data?.publicUrl || null, filename: file.name || safeName }
}

// Run Gemini transcription on an audio Blob/File. Returns { transcript, summary }.
// 3-sentence summary is requested in the same call to avoid a second round-trip.
export async function transcribeAndSummarise(file, { context = '' } = {}) {
  const base64 = await blobToBase64(file)
  const mimeType = file.type || 'audio/webm'

  const prompt = [
    'You are a senior associate at an investment-advisory firm. Transcribe the attached audio, then write a tight 3-sentence summary of what was discussed.',
    context ? `Context: ${context}` : '',
    'Return JSON only, with this exact shape: {"transcript": "...", "summary": "..."}'
  ].filter(Boolean).join('\n\n')

  // Audio transcription is a Gemini-specific feature today (other
  // providers in the proxy don't accept inline_data audio parts in the
  // same shape). Use the raw-passthrough escape hatch so the proxy
  // forwards our exact body verbatim — and so the server key is what
  // actually authenticates the call, not anything baked into client JS.
  const json = await llmCallRaw({
    url: '/models/gemini-2.0-flash:generateContent',
    body: {
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: base64 } }
        ]
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4000,
        responseMimeType: 'application/json'
      }
    },
    actionType: 'voice_memo_transcribe'
  })
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
  let parsed = null
  try { parsed = JSON.parse(text) } catch { /* fall through */ }
  if (!parsed || typeof parsed.transcript !== 'string') {
    return { transcript: text, summary: '' }
  }
  return { transcript: parsed.transcript, summary: parsed.summary || '' }
}
