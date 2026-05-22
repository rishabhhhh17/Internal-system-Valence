import { useEffect, useMemo, useState } from 'react'
import { Users, Loader2, Check, AlertTriangle, Building2 } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { humanError } from '../lib/userError.js'
import {
  parseBulkPeople,
  buildInsertableBulk,
  extractCompanies
} from '../lib/people.js'
import { useToast } from './Toast.jsx'

const PLACEHOLDER = `Paste one person per line — any of these shapes work:

Alice Smith
Alice Smith <alice@acme.com>
Alice Smith | CEO | alice@acme.com
Alice Smith, CEO, Acme Holdings
Alice Smith — CEO at Acme Holdings

Lines starting with # are ignored.`

// Standalone or company-prefilled bulk add. `initialCompany` defaults the
// company picker; `onCompanyChange` is called when the user edits it so
// the parent (e.g. a company drop chip's inline panel) can stay in sync.
export default function BulkAddPeoplePanel({
  initialCompany = '',
  compact = false,
  onAfterImport
} = {}) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [company, setCompany] = useState(initialCompany)
  const [existingCompanies, setExistingCompanies] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => { setCompany(initialCompany) }, [initialCompany])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await supabase.from('people').select('company')
        if (!cancelled) setExistingCompanies(extractCompanies(data || []).map(c => c.name))
      } catch { /* swallow */ }
    })()
    return () => { cancelled = true }
  }, [])

  const parsed = useMemo(() => parseBulkPeople(text, { defaultCompany: company.trim() }), [text, company])
  const validCount = parsed.rows.filter(r => r.errors.length === 0).length
  const invalidCount = parsed.rows.length - validCount

  async function runImport() {
    if (!isSupabaseConfigured) {
      toast.error('Supabase is not configured — bulk add needs the database.')
      return
    }
    const payload = buildInsertableBulk(parsed.rows, { defaultCompany: company.trim() })
    if (payload.length === 0) {
      toast.error('No valid rows to import — paste at least one name.')
      return
    }
    setBusy(true)
    try {
      // Chunked just like CsvContactImport, in case someone pastes a roster
      // of hundreds.
      const CHUNK = 200
      let inserted = 0
      for (let i = 0; i < payload.length; i += CHUNK) {
        const batch = payload.slice(i, i + CHUNK)
        const { error, data } = await supabase.from('people').insert(batch).select('id')
        if (error) throw error
        inserted += data?.length ?? batch.length
      }
      toast.success(
        invalidCount > 0
          ? `Added ${inserted} people (${invalidCount} skipped — missing name).`
          : `Added ${inserted} people.`
      )
      setText('')
      onAfterImport?.()
    } catch (err) {
      toast.error(humanError(err, 'Bulk add failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`vl-card space-y-4 ${compact ? 'p-4' : 'p-6'}`}>
      {!compact && (
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-valence-blue-soft p-2 text-valence-blue">
            <Users className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-valence-text">Bulk-add people</h3>
            <p className="text-xs text-valence-muted mt-0.5">
              Paste a list — one person per line. Optional company below applies to every line that didn't include its own.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="vl-label" htmlFor="bulk-company">
          <Building2 className="inline h-3 w-3 mr-1" /> Default company {compact ? '' : '(optional)'}
        </label>
        <input
          id="bulk-company"
          list="bulk-company-list"
          value={company}
          onChange={e => setCompany(e.target.value)}
          placeholder="Acme Holdings"
          className="vl-input"
        />
        <datalist id="bulk-company-list">
          {existingCompanies.map(c => <option key={c} value={c} />)}
        </datalist>
      </div>

      <div className="space-y-1.5">
        <label className="vl-label" htmlFor="bulk-text">People — one per line</label>
        <textarea
          id="bulk-text"
          value={text}
          onChange={e => setText(e.target.value)}
          rows={compact ? 5 : 8}
          placeholder={PLACEHOLDER}
          className="vl-input font-mono text-[12px] leading-relaxed resize-y min-h-[120px]"
          spellCheck={false}
        />
      </div>

      {parsed.rows.length > 0 && (
        <div className="rounded-lg border border-valence-border bg-valence-surface/50 overflow-hidden">
          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-valence-subtle border-b border-valence-border">
            Preview · {validCount} valid · {invalidCount > 0 && <span className="text-amber-700">{invalidCount} with errors</span>}
          </div>
          <div className="max-h-48 overflow-y-auto divide-y divide-valence-border/60">
            {parsed.rows.slice(0, 30).map((r, i) => (
              <div key={i} className="grid grid-cols-[140px_140px_140px_minmax(0,1fr)] gap-2 px-3 py-1.5 text-[12px]">
                <span className={`truncate font-medium ${r.full_name ? 'text-valence-text' : 'text-rose-700'}`}>
                  {r.full_name || '— missing —'}
                </span>
                <span className="truncate text-valence-muted">{r.role || ''}</span>
                <span className="truncate text-valence-muted">{r.company || (company.trim() ? <em className="italic text-valence-subtle">{company.trim()}</em> : '')}</span>
                <span className="truncate text-valence-muted">{r.email || ''}</span>
              </div>
            ))}
            {parsed.rows.length > 30 && (
              <div className="px-3 py-1.5 text-[11px] text-valence-subtle italic">
                … and {parsed.rows.length - 30} more
              </div>
            )}
          </div>
        </div>
      )}

      {invalidCount > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-start gap-2 text-[12px] text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{invalidCount} row{invalidCount > 1 ? 's' : ''} missing a name will be skipped.</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => { setText(''); }}
          disabled={busy || !text.trim()}
          className="vl-btn-ghost text-xs"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={runImport}
          disabled={busy || validCount === 0}
          className="vl-btn-primary-sm"
        >
          {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Adding…</> : <><Check className="h-3.5 w-3.5" /> Add {validCount} {validCount === 1 ? 'person' : 'people'}</>}
        </button>
      </div>
    </div>
  )
}
