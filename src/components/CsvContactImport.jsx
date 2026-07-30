import { useRef, useState } from 'react'
import { UploadCloud, FileText, AlertTriangle, Check, Loader2, X } from 'lucide-react'
import {
  parseCSV,
  inferMapping,
  mapRows,
  IMPORT_FIELDS,
  SKIP_COLUMN,
  summarizeMapping
} from '../lib/csvImport.js'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { humanError } from '../lib/userError.js'
import { useToast } from './Toast.jsx'

const PREVIEW_ROWS = 5

export default function CsvContactImport() {
  const toast = useToast()
  const fileInputRef = useRef(null)
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState(null) // { headers, rows }
  const [mapping, setMapping] = useState(null) // { header: fieldKey | SKIP_COLUMN }
  const [importing, setImporting] = useState(false)

  function reset() {
    setFileName('')
    setParsed(null)
    setMapping(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleFile(file) {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File is over 5 MB — split into smaller chunks.')
      return
    }
    try {
      const text = await file.text()
      const { headers, rows } = parseCSV(text)
      if (headers.length === 0) {
        toast.error('Could not detect any columns — is this a CSV?')
        return
      }
      setFileName(file.name)
      setParsed({ headers, rows })
      setMapping(inferMapping(headers))
    } catch (err) {
      toast.error(humanError(err, 'Could not read file'))
    }
  }

  function changeMapping(header, fieldKey) {
    setMapping(prev => {
      const next = { ...prev }
      // Ensure no two headers map to the same target field (other than SKIP).
      if (fieldKey !== SKIP_COLUMN) {
        for (const h of Object.keys(next)) {
          if (next[h] === fieldKey && h !== header) next[h] = SKIP_COLUMN
        }
      }
      next[header] = fieldKey
      return next
    })
  }

  async function runImport() {
    if (!parsed || !mapping) return
    if (!isSupabaseConfigured) {
      toast.error('Supabase is not configured for this build.')
      return
    }
    const mapped = mapRows(parsed.rows, parsed.headers, mapping)
    const valid = mapped.filter(r => r.errors.length === 0)
    const invalid = mapped.length - valid.length
    if (valid.length === 0) {
      toast.error('No importable rows — fix mapping or required fields.')
      return
    }
    setImporting(true)
    try {
      // Insert in chunks of 200 to keep payloads under PostgREST limits.
      const CHUNK = 200
      let inserted = 0
      for (let i = 0; i < valid.length; i += CHUNK) {
        const batch = valid.slice(i, i + CHUNK).map(r => r.insertable)
        const { error, data } = await supabase.from('people').insert(batch).select('id')
        if (error) throw error
        inserted += data?.length ?? batch.length
      }
      toast.success(
        invalid > 0
          ? `Imported ${inserted} contacts (${invalid} skipped).`
          : `Imported ${inserted} contacts.`
      )
      reset()
    } catch (err) {
      toast.error(humanError(err, 'Could not import contacts'))
    } finally {
      setImporting(false)
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="vl-card p-6 text-sm text-valence-muted">
        <div className="font-semibold text-valence-text mb-1 flex items-center gap-2">
          <UploadCloud className="h-4 w-4 text-valence-blue" /> Import contacts
        </div>
        <p>Supabase is not configured for this build, so CSV import is disabled.</p>
      </div>
    )
  }

  if (!parsed) {
    return (
      <div className="vl-card p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="rounded-lg bg-valence-blue-soft p-2 text-valence-blue">
            <UploadCloud className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-valence-text">Import contacts</h3>
            <p className="text-xs text-valence-muted mt-0.5">
              Upload a CSV. First row should be column headers — we auto-match Name / Email / Company / Role.
            </p>
          </div>
        </div>

        <label
          htmlFor="csv-file-input"
          className="block rounded-xl border-2 border-dashed border-valence-border bg-valence-surface/60 px-4 py-8 text-center cursor-pointer hover:border-valence-blue/40 hover:bg-valence-blue-soft/30 transition"
        >
          <UploadCloud className="h-6 w-6 mx-auto text-valence-blue" />
          <p className="mt-2 text-sm font-medium text-valence-text">Click to choose a CSV</p>
          <p className="text-[11px] text-valence-muted mt-0.5">or drop it here · max 5 MB</p>
          <input
            id="csv-file-input"
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={e => handleFile(e.target.files?.[0])}
          />
        </label>
      </div>
    )
  }

  const summary = summarizeMapping(mapping)
  const mapped = mapRows(parsed.rows, parsed.headers, mapping)
  const validCount = mapped.filter(r => r.errors.length === 0).length
  const invalidCount = mapped.length - validCount

  return (
    <div className="vl-card p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-valence-blue-soft p-2 text-valence-blue">
          <FileText className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-valence-text truncate">{fileName}</h3>
            <span className="vl-chip text-[10px]">{parsed.rows.length} rows</span>
          </div>
          <p className="text-xs text-valence-muted mt-0.5">
            {summary.mapped} columns mapped · {summary.skipped} skipped · {validCount} importable · {invalidCount} with errors
          </p>
        </div>
        <button type="button" onClick={reset} className="vl-btn-ghost shrink-0" aria-label="Start over">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Column mapper */}
      <div className="space-y-1.5">
        <div className="vl-eyebrow-ink">Column mapping</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {parsed.headers.map(h => (
            <div key={h} className="flex items-center gap-2 rounded-lg border border-valence-border bg-valence-elevated px-3 py-2">
              <span className="text-xs font-mono text-valence-muted truncate flex-1" title={h}>{h || '(blank)'}</span>
              <select
                value={mapping[h] || SKIP_COLUMN}
                onChange={e => changeMapping(h, e.target.value)}
                className="text-xs rounded-md border border-valence-border bg-valence-elevated px-2 py-1 text-valence-text focus:outline-none focus:border-valence-blue"
              >
                <option value={SKIP_COLUMN}>Skip</option>
                {IMPORT_FIELDS.map(f => (
                  <option key={f.key} value={f.key}>
                    {f.label}{f.required ? ' *' : ''}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="space-y-1.5">
        <div className="vl-eyebrow-ink">Preview — first {Math.min(PREVIEW_ROWS, parsed.rows.length)} rows</div>
        <div className="overflow-x-auto rounded-lg border border-valence-border">
          <table className="w-full text-xs">
            <thead className="bg-valence-surface">
              <tr>
                {parsed.headers.map(h => (
                  <th key={h} className="px-2.5 py-1.5 text-left font-semibold text-valence-muted whitespace-nowrap">
                    {h || '(blank)'}
                    <div className="text-[9px] font-medium text-valence-blue normal-case tracking-normal">
                      → {mapping[h] === SKIP_COLUMN ? 'skip' : (IMPORT_FIELDS.find(f => f.key === mapping[h])?.label || mapping[h])}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parsed.rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                <tr key={i} className="border-t border-valence-border">
                  {row.map((cell, c) => (
                    <td key={c} className="px-2.5 py-1.5 text-valence-text whitespace-nowrap max-w-[200px] truncate" title={cell}>
                      {cell || <span className="text-valence-subtle italic">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {invalidCount > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-start gap-2 text-[12px] text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            {invalidCount} row{invalidCount > 1 ? 's' : ''} will be skipped — required field <b>Full name</b> is missing. Map a column to <b>Full name *</b> to include them.
          </span>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={reset} className="vl-btn-secondary-sm" disabled={importing}>
          Start over
        </button>
        <button type="button" onClick={runImport} className="vl-btn-primary-sm" disabled={importing || validCount === 0}>
          {importing
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Importing…</>
            : <><Check className="h-3.5 w-3.5" /> Import {validCount} contact{validCount === 1 ? '' : 's'}</>}
        </button>
      </div>
    </div>
  )
}
