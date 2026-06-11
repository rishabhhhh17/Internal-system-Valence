import { useState } from 'react'
import { Tag, RotateCcw } from 'lucide-react'
import { STAGES, LP_STAGES } from '../lib/stages.js'
import { FOUNDER_DOCS, LP_DOCS } from '../lib/diligenceDocs.js'
import {
  stageOverrideKey, docOverrideKey, getAllOverrides, setLabelOverride
} from '../lib/labels.js'
import { useToast } from './Toast.jsx'

// Terminology — rename pipeline stages and document titles to your fund's own
// language (e.g. "Memo" → "I Memo"). Renames are display-only; the stored IDs
// never change, so existing deals/records are untouched.
const GROUPS = [
  { title: 'Founder pipeline stages', sub: 'The company deal funnel.', items: STAGES.map(s => ({ key: stageOverrideKey('company', s.id), builtin: s.label || s.id })) },
  { title: 'LP pipeline stages',      sub: 'The fundraising funnel.',  items: LP_STAGES.map(s => ({ key: stageOverrideKey('lp', s.id), builtin: s.label || s.id })) },
  { title: 'Founder documents',       sub: 'Diligence document titles.', items: FOUNDER_DOCS.map(d => ({ key: docOverrideKey('company', d.key), builtin: d.label })) },
  { title: 'LP documents',            sub: 'Investor collateral titles.', items: LP_DOCS.map(d => ({ key: docOverrideKey('lp', d.key), builtin: d.label })) }
]

export default function TerminologyPanel() {
  const toast = useToast()
  const [ov, setOv] = useState(getAllOverrides())
  const dirty = Object.keys(ov).length > 0

  function update(key, value) {
    setLabelOverride(key, value)
    setOv(getAllOverrides())
  }
  function resetAll() {
    for (const k of Object.keys(ov)) setLabelOverride(k, '')
    setOv(getAllOverrides())
    toast.success('Reset to default names.')
  }

  return (
    <div className="space-y-4">
      <div className="vl-card p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-valence-blue-soft text-valence-blue"><Tag className="h-5 w-5" /></span>
            <div>
              <h2 className="text-[15px] font-semibold text-valence-text">Terminology</h2>
              <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-valence-muted">
                Rename pipeline stages and document titles to match your fund’s own language. Renames are display-only — they don’t move any deals or records.
              </p>
            </div>
          </div>
          {dirty && (
            <button onClick={resetAll} className="vl-btn-secondary-sm shrink-0"><RotateCcw className="h-3.5 w-3.5" /> Reset all</button>
          )}
        </div>
      </div>

      {GROUPS.map(g => (
        <div key={g.title} className="vl-card p-6">
          <div className="mb-4">
            <h3 className="text-[13px] font-semibold text-valence-text">{g.title}</h3>
            <p className="text-[11px] text-valence-muted">{g.sub}</p>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {g.items.map(it => (
              <label key={it.key} className="flex items-center gap-3">
                <span className="w-32 shrink-0 truncate text-[12px] text-valence-muted" title={it.builtin}>{it.builtin}</span>
                <input
                  className="vl-input h-9 flex-1 text-sm"
                  value={ov[it.key] || ''}
                  placeholder={it.builtin}
                  onChange={e => update(it.key, e.target.value)}
                />
              </label>
            ))}
          </div>
        </div>
      ))}

      <p className="px-1 text-[11px] leading-relaxed text-valence-subtle">
        Leave a field blank to use the default name. Changes apply across the pipeline, document tracker, and reports.
      </p>
    </div>
  )
}
