import { useRef } from 'react'
import { Paperclip, X, FileText } from 'lucide-react'

// Pre-creation document picker used by the "Advanced new deal" flow.
// User picks files BEFORE the deal exists; we hold them in parent state
// and upload them after the deal-insert returns the new id.
//
// Each pending file carries a category (Pitch deck / NDA / Data room / Deck /
// Term sheet / Diligence / Side letter / Other) matching the CHECK
// constraint on deal_files.category. Defaults to "Other" so the user can
// drop a file and only categorise it if they care.

const CATEGORIES = ['Pitch deck', 'NDA', 'Data room', 'Deck', 'Term sheet', 'Diligence', 'Side letter', 'Other']

function formatBytes(n) {
  if (!n && n !== 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export default function DealDocumentsUploader({ files, onChange }) {
  const inputRef = useRef(null)

  function addFiles(list) {
    const next = Array.from(list)
      .filter(f => f && f.size <= 25 * 1024 * 1024)  // hard cap matches FileVault
      .map(f => ({ file: f, category: guessCategory(f.name) }))
    if (next.length === 0) return
    onChange([...(files || []), ...next])
  }

  function setCategory(idx, category) {
    onChange(files.map((row, i) => i === idx ? { ...row, category } : row))
  }

  function remove(idx) {
    onChange(files.filter((_, i) => i !== idx))
  }

  function onPick(e) {
    const list = e.target.files
    e.target.value = ''
    if (list) addFiles(list)
  }

  function onDrop(e) {
    e.preventDefault()
    if (e.dataTransfer?.files) addFiles(e.dataTransfer.files)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="vl-eyebrow-ink">Documents</p>
          <p className="text-[11px] text-valence-muted mt-0.5">
            Attach the NDA, side letter, deck — anything you already have. Uploaded once the deal is created.
          </p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="vl-btn-secondary text-xs"
        >
          <Paperclip className="h-3.5 w-3.5" /> Pick files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={onPick}
        />
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={onDrop}
        className="rounded-lg border border-dashed border-valence-border bg-valence-surface/40 px-4 py-3"
      >
        {(!files || files.length === 0) ? (
          <p className="text-xs text-valence-muted text-center py-2">
            Drag &amp; drop files here, or click <span className="font-semibold text-valence-text">Pick files</span> above.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {files.map((row, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg border border-valence-border bg-valence-elevated px-3 py-2">
                <FileText className="h-3.5 w-3.5 text-valence-blue shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-semibold text-valence-text">{row.file.name}</p>
                  <p className="text-[10px] text-valence-muted">{formatBytes(row.file.size)} · {row.file.type || 'unknown type'}</p>
                </div>
                <select
                  value={row.category}
                  onChange={e => setCategory(i, e.target.value)}
                  className="vl-input h-7 text-xs py-0 px-1.5 max-w-[140px]"
                  title="Category"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="p-1 text-valence-subtle hover:text-valence-danger"
                  title="Remove"
                  aria-label={`Remove ${row.file.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// Heuristic: pre-fill the category dropdown when the filename obviously
// tells us what kind of document it is. User can still flip it manually.
function guessCategory(name) {
  const n = (name || '').toLowerCase()
  if (/\bnda\b|non[-_ ]?disclosure/.test(n))           return 'NDA'
  if (/teaser/.test(n))                                 return 'Pitch deck'
  if (/\bim\b|information[-_ ]?memorandum/.test(n))     return 'Data room'
  if (/deck|pitch|presentation/.test(n))                return 'Pitch deck'
  if (/\bloi\b|letter[-_ ]?of[-_ ]?intent/.test(n))     return 'Term sheet'
  if (/diligence|due[-_ ]?dilig/.test(n))               return 'Diligence'
  if (/\bspa\b|share[-_ ]?purchase|term[-_ ]?sheet/.test(n)) return 'Term sheet'
  if (/engagement|el[-_ ]?signed|side[-_ ]?letter/.test(n))  return 'Side letter'
  return 'Other'
}
