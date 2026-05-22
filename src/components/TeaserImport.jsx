import { useRef, useState } from 'react'
import { Sparkles, Upload, Loader2, FileText } from 'lucide-react'
import { extractText, fileTypeFor } from '../lib/fileParse.js'
import { extractDealFromTeaser, isGeminiConfigured } from '../lib/gemini.js'
import { humanError } from '../lib/userError.js'
import { useToast } from './Toast.jsx'

// Compact inline panel shown at the top of the "New deal" modal.
// Drop a teaser → extracts fields → invokes onExtracted() with prefills.
export default function TeaserImport({ onExtracted }) {
  const toast = useToast()
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [label, setLabel] = useState('')

  async function handle(file) {
    if (!file) return
    if (!fileTypeFor(file)) return toast.error('Unsupported file type')
    if (!isGeminiConfigured) return toast.error('Gemini key needed for auto-extract')
    setBusy(true); setLabel('Reading…')
    try {
      const text = await extractText(file, { onProgress: (_, l) => setLabel(l || 'Reading…') })
      setLabel('Extracting deal fields…')
      const data = await extractDealFromTeaser(text)
      toast.success('Deal fields extracted. Review and save.')
      onExtracted?.(data)
    } catch (e) {
      toast.error(humanError(e, 'Could not read teaser'))
    } finally {
      setBusy(false); setLabel('')
    }
  }

  return (
    <div
      onClick={() => !busy && inputRef.current?.click()}
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); if (!busy) handle(e.dataTransfer.files?.[0]) }}
      className={`mb-4 flex items-center gap-3 rounded-xl border border-dashed px-4 py-3 transition cursor-pointer ${
        busy ? 'border-valence-blue/50 bg-valence-blue-soft/30' : 'border-valence-border bg-valence-surface hover:border-valence-blue/40'
      }`}
    >
      <input ref={inputRef} type="file" className="hidden" accept=".pdf,.docx,.txt" onChange={e => { const f = e.target.files?.[0]; e.target.value=''; handle(f) }} />
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-valence-blue-soft ring-1 ring-valence-blue/30 shrink-0">
        {busy ? <Loader2 className="h-4 w-4 text-valence-blue animate-spin" /> : <Sparkles className="h-4 w-4 text-valence-blue" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-valence-text">{busy ? label : 'Drop a teaser to auto-fill this form'}</p>
        <p className="text-[11px] text-valence-muted">
          {busy ? 'Keep the modal open while AI extracts client name, sector, ticket size, and notes.' : 'PDF, DOCX, TXT · AI reads it, fills in the fields, you review.'}
        </p>
      </div>
      <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-valence-subtle">
        <Upload className="h-3 w-3" /> click or drop
      </span>
    </div>
  )
}
