// AI-assisted import — drop any file (CSV / XLSX / PDF / DOCX / TXT) or
// paste text, and the active LLM proposes how each entity should land
// in the right table (deals / people / funds / interactions / companies).
// The user reviews the proposal, edits fields inline, deselects anything
// that's wrong, and commits with one button. Inserts are scoped to the
// signed-in user's org_id via the multi-tenant RLS policies.
//
// Flow:
//   1. Idle      — drop zone + paste box visible
//   2. Reading   — extracting text from the file
//   3. Thinking  — LLM classifying entities
//   4. Preview   — user reviews + edits + commits
//   5. Done      — results banner with what landed (and what failed)

import { useState, useRef, useEffect } from 'react'
import {
  Upload, FileText, Sparkles, Loader2, Check, X, AlertTriangle,
  User, Briefcase, Building2, Phone, Trash2, Plus, ArrowLeft
} from 'lucide-react'
import { extractText, fileTypeFor } from '../lib/fileParse.js'
import { classifyImport, commitEntities, KIND_META } from '../lib/aiImport.js'
import { useSeat } from '../hooks/useSeat.js'
import { useToast } from '../components/Toast.jsx'

export default function Import() {
  const { org } = useSeat()
  const toast = useToast()
  const fileRef = useRef(null)
  const [phase,     setPhase]     = useState('idle')   // idle | reading | thinking | preview | done
  const [progress,  setProgress]  = useState({ pct: 0, label: '' })
  const [hint,      setHint]      = useState('')       // user-supplied "what is this" hint
  const [pastedText, setPastedText] = useState('')
  const [summary,    setSummary]    = useState('')
  const [entities,   setEntities]   = useState([])
  const [results,    setResults]    = useState([])
  const [committing, setCommitting] = useState(false)

  async function handleFile(file) {
    if (!file) return
    if (!fileTypeFor(file)) {
      toast.error(`Can't read .${(file.name.split('.').pop() || '').toLowerCase()} files yet.`)
      return
    }
    setPhase('reading'); setProgress({ pct: 0.05, label: 'Reading file' })
    let text
    try {
      text = await extractText(file, { onProgress: (pct, label) => setProgress({ pct, label }) })
    } catch (err) {
      toast.error(err?.message || 'Could not read file')
      setPhase('idle'); return
    }
    if (!text || !text.trim()) {
      toast.error('File looks empty.')
      setPhase('idle'); return
    }
    await runClassifier(text, { sourceLabel: file.name })
  }

  async function handlePaste() {
    if (!pastedText.trim()) { toast.error('Paste something first.'); return }
    await runClassifier(pastedText, { sourceLabel: 'pasted text' })
  }

  async function runClassifier(text, { sourceLabel }) {
    setPhase('thinking'); setProgress({ pct: 0.7, label: 'AI is reading…' })
    try {
      const result = await classifyImport(text, { hint })
      setSummary(result.summary || `Read from ${sourceLabel}.`)
      setEntities(result.entities || [])
      if ((result.entities || []).length === 0) {
        toast.info('No structured entities found. Try a different file or add a hint.')
        setPhase('idle')
        return
      }
      setPhase('preview')
    } catch (err) {
      toast.error(err?.message || 'AI classification failed')
      setPhase('idle')
    }
  }

  function editField(eid, key, val) {
    setEntities(es => es.map(e => e.id === eid
      ? { ...e, fields: { ...e.fields, [key]: val } }
      : e
    ))
  }
  function toggleSkip(eid) {
    setEntities(es => es.map(e => e.id === eid
      ? { ...e, action: e.action === 'skip' ? 'create' : 'skip' }
      : e
    ))
  }
  function changeKind(eid, kind) {
    setEntities(es => es.map(e => e.id === eid ? { ...e, kind } : e))
  }
  function removeEntity(eid) {
    setEntities(es => es.filter(e => e.id !== eid))
  }

  async function commit() {
    if (!org?.id) { toast.error('No active team — finish onboarding first.'); return }
    setCommitting(true)
    try {
      const res = await commitEntities(entities, { orgId: org.id })
      setResults(res)
      const ok = res.filter(r => r.ok).length
      const fail = res.length - ok
      if (fail === 0) toast.success(`Created ${ok} item${ok === 1 ? '' : 's'}.`)
      else toast.error(`${ok} created · ${fail} failed — see details below.`)
      setPhase('done')
    } catch (err) {
      toast.error(err?.message || 'Commit failed')
    } finally {
      setCommitting(false)
    }
  }

  function reset() {
    setPhase('idle'); setEntities([]); setSummary(''); setResults([])
    setPastedText(''); setHint(''); setProgress({ pct: 0, label: '' })
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-4">
        <div className="rounded-xl bg-valence-blue-soft p-3 text-valence-blue">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <p className="vl-eyebrow-ink">Import</p>
          <h1 className="vl-section-title mt-1">Drop in data — we'll route it</h1>
          <p className="vl-section-kicker max-w-2xl">
            Spreadsheet of contacts, a teaser PDF, a deal brief, meeting notes —
            drop anything in. The AI proposes where each row should go (deals,
            people, funds, interactions). You review, edit, and commit.
          </p>
        </div>
      </header>

      {phase === 'idle' && (
        <IdleCard
          onFile={handleFile}
          onPaste={handlePaste}
          hint={hint}
          setHint={setHint}
          pastedText={pastedText}
          setPastedText={setPastedText}
          fileRef={fileRef}
        />
      )}

      {(phase === 'reading' || phase === 'thinking') && (
        <ProgressCard progress={progress} phase={phase} />
      )}

      {phase === 'preview' && (
        <PreviewCard
          summary={summary}
          entities={entities}
          onEdit={editField}
          onToggleSkip={toggleSkip}
          onChangeKind={changeKind}
          onRemove={removeEntity}
          onCommit={commit}
          onCancel={reset}
          committing={committing}
        />
      )}

      {phase === 'done' && (
        <DoneCard results={results} entities={entities} onReset={reset} />
      )}
    </div>
  )
}

// ============ IDLE ============
function IdleCard({ onFile, onPaste, hint, setHint, pastedText, setPastedText, fileRef }) {
  const [dragging, setDragging] = useState(false)

  function onDragOver(e) { e.preventDefault(); setDragging(true) }
  function onDragLeave()    { setDragging(false) }
  function onDrop(e) {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) onFile(file)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={`vl-card p-8 cursor-pointer transition border-2 border-dashed text-center ${
          dragging ? 'border-valence-blue bg-valence-blue-soft' : 'border-valence-border hover:border-valence-blue/40'
        }`}
      >
        <Upload className="h-8 w-8 text-valence-blue mx-auto" />
        <p className="mt-3 text-base font-semibold text-valence-text">
          {dragging ? 'Drop to import' : 'Drag a file here'}
        </p>
        <p className="mt-1 text-xs text-valence-muted">
          XLSX · CSV · PDF · DOCX · TXT · MD — up to ~10MB
        </p>
        <button type="button" className="vl-btn-secondary-sm mt-4">
          <FileText className="h-3.5 w-3.5" /> Choose file
        </button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept=".xlsx,.xls,.csv,.pdf,.docx,.txt,.md"
          onChange={e => onFile(e.target.files?.[0])}
        />
      </div>

      <div className="vl-card p-6 space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-valence-muted" />
          <p className="text-sm font-semibold text-valence-text">Or paste text</p>
        </div>
        <textarea
          className="vl-input min-h-[160px] text-xs leading-relaxed resize-y"
          placeholder="Paste an email thread, meeting notes, a list of contacts, a deal brief — anything. AI will figure out the structure."
          value={pastedText}
          onChange={e => setPastedText(e.target.value)}
        />
        <input
          className="vl-input text-xs"
          placeholder='Optional hint ("this is our fund list", "people I met at LP day", etc.)'
          value={hint}
          onChange={e => setHint(e.target.value)}
        />
        <div className="flex justify-end">
          <button onClick={onPaste} disabled={!pastedText.trim()} className="vl-btn-primary-sm">
            <Sparkles className="h-3.5 w-3.5" /> Read with AI
          </button>
        </div>
      </div>
    </div>
  )
}

// ============ PROGRESS ============
function ProgressCard({ progress, phase }) {
  return (
    <div className="vl-card p-8 text-center space-y-3">
      <Loader2 className="h-6 w-6 mx-auto animate-spin text-valence-blue" />
      <p className="text-sm font-semibold text-valence-text">
        {phase === 'reading' ? 'Reading file…' : 'AI is reading the document…'}
      </p>
      <p className="text-xs text-valence-muted">{progress.label}</p>
      <div className="max-w-md mx-auto h-1.5 rounded-full bg-valence-surface overflow-hidden">
        <div
          className="h-full bg-valence-blue transition-all duration-300"
          style={{ width: `${Math.round((progress.pct || 0) * 100)}%` }}
        />
      </div>
    </div>
  )
}

// ============ PREVIEW ============
function PreviewCard({ summary, entities, onEdit, onToggleSkip, onChangeKind, onRemove, onCommit, onCancel, committing }) {
  const toCreate = entities.filter(e => e.action !== 'skip').length
  const counts = entities.reduce((acc, e) => {
    if (e.action === 'skip') return acc
    acc[e.kind] = (acc[e.kind] || 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-4">
      <div className="vl-card p-5">
        <div className="flex items-start gap-3">
          <Sparkles className="h-4 w-4 text-valence-blue mt-0.5" />
          <div className="flex-1">
            <p className="vl-eyebrow-ink">AI read</p>
            <p className="text-sm text-valence-text mt-0.5">{summary || 'Found these entities in your document.'}</p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {Object.entries(counts).map(([k, n]) => (
                <span key={k} className="vl-chip-blue text-[10px]">
                  {n} {KIND_META[k]?.label || k}{n === 1 ? '' : 's'}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {entities.map(e => (
          <EntityRow
            key={e.id}
            entity={e}
            onEdit={onEdit}
            onToggleSkip={onToggleSkip}
            onChangeKind={onChangeKind}
            onRemove={onRemove}
          />
        ))}
      </div>

      <div className="vl-card p-4 flex items-center justify-between sticky bottom-4 shadow-valence">
        <button onClick={onCancel} disabled={committing} className="vl-btn-ghost">
          <ArrowLeft className="h-4 w-4" /> Start over
        </button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-valence-muted">{toCreate} item{toCreate === 1 ? '' : 's'} ready to create</span>
          <button onClick={onCommit} disabled={committing || toCreate === 0} className="vl-btn-primary-sm">
            {committing ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating…</> : <><Check className="h-3.5 w-3.5" /> Create all</>}
          </button>
        </div>
      </div>
    </div>
  )
}

function EntityRow({ entity, onEdit, onToggleSkip, onChangeKind, onRemove }) {
  const skip = entity.action === 'skip'
  const meta = KIND_META[entity.kind] || { label: entity.kind, primary: 'name' }
  const Icon = entity.kind === 'person'      ? User
            : entity.kind === 'deal'        ? Briefcase
            : entity.kind === 'fund'        ? Building2
            : entity.kind === 'interaction' ? Phone
            : entity.kind === 'company'     ? Building2
            : FileText
  const confColor = entity.confidence >= 0.75 ? 'text-valence-success'
                  : entity.confidence >= 0.4  ? 'text-valence-warning'
                  :                              'text-valence-danger'

  return (
    <div className={`vl-card p-4 transition ${skip ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-valence-blue-soft p-2 text-valence-blue shrink-0">
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <select
              className="text-xs font-semibold bg-transparent border-b border-valence-border focus:border-valence-blue outline-none cursor-pointer"
              value={entity.kind}
              onChange={e => onChangeKind(entity.id, e.target.value)}
            >
              {Object.entries(KIND_META).map(([k, m]) => (
                <option key={k} value={k}>{m.label}</option>
              ))}
            </select>
            <span className={`text-[10px] font-semibold ${confColor}`}>
              {Math.round(entity.confidence * 100)}% confidence
            </span>
            {entity.source && (
              <span className="text-[10px] text-valence-subtle">· {entity.source}</span>
            )}
          </div>
          <FieldsEditor kind={entity.kind} fields={entity.fields} onEdit={(k, v) => onEdit(entity.id, k, v)} />
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <button onClick={() => onToggleSkip(entity.id)} className="vl-btn-ghost text-[11px]" title={skip ? 'Include this' : 'Skip this'}>
            {skip ? <Plus className="h-3 w-3" /> : <X className="h-3 w-3" />}
          </button>
          <button onClick={() => onRemove(entity.id)} className="vl-btn-ghost text-[11px]" title="Remove">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  )
}

// Inline editor — shows the most important 3-5 fields per kind so the
// user can correct mistakes without diving into a separate form. The
// rest of the fields commit silently (the user can edit them on the
// destination page after import).
function FieldsEditor({ kind, fields, onEdit }) {
  const layout = (() => {
    switch (kind) {
      case 'person':      return [['full_name', 'Name'], ['email', 'Email'], ['company', 'Company'], ['title', 'Title']]
      case 'deal':        return [['client_name', 'Client'], ['deal_type', 'Type'], ['sector', 'Sector'], ['ticket_size_usd_m', 'EV ($M)']]
      case 'fund':        return [['name', 'Fund name'], ['fund_type', 'Type'], ['hq_city', 'HQ'], ['warmth', 'Warmth']]
      case 'interaction': return [['counterparty_name', 'Counterparty'], ['type', 'Kind'], ['outcome', 'Outcome'], ['date', 'Date']]
      case 'company':     return [['name', 'Name'], ['sector', 'Sector'], ['hq_city', 'HQ']]
      default:            return Object.keys(fields).slice(0, 4).map(k => [k, k])
    }
  })()
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {layout.map(([key, label]) => (
        <label key={key} className="block">
          <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-valence-subtle">{label}</span>
          <input
            className="block w-full mt-0.5 bg-transparent border-b border-valence-border focus:border-valence-blue outline-none text-xs py-1 text-valence-text"
            value={fields[key] != null ? String(fields[key]) : ''}
            onChange={e => onEdit(key, e.target.value)}
          />
        </label>
      ))}
      {fields.notes && (
        <label className="block col-span-full">
          <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-valence-subtle">Notes</span>
          <textarea
            className="block w-full mt-0.5 bg-transparent border-b border-valence-border focus:border-valence-blue outline-none text-xs py-1 text-valence-text resize-none"
            rows={1}
            value={fields.notes || ''}
            onChange={e => onEdit('notes', e.target.value)}
          />
        </label>
      )}
    </div>
  )
}

// ============ DONE ============
function DoneCard({ results, entities, onReset }) {
  const ok = results.filter(r => r.ok).length
  const fail = results.filter(r => !r.ok)
  return (
    <div className="space-y-4">
      <div className="vl-card p-6 text-center space-y-3">
        <div className="rounded-full bg-valence-blue-soft p-3 inline-flex">
          <Check className="h-5 w-5 text-valence-blue" />
        </div>
        <p className="text-base font-semibold text-valence-text">
          {ok} item{ok === 1 ? '' : 's'} added to your workspace.
        </p>
        {fail.length > 0 && (
          <p className="text-xs text-valence-danger">
            {fail.length} couldn't be saved — open the relevant page and add them by hand.
          </p>
        )}
        <div className="flex items-center justify-center gap-2 pt-2">
          <button onClick={onReset} className="vl-btn-primary-sm">
            <Upload className="h-3.5 w-3.5" /> Import more
          </button>
          <a href="/people" className="vl-btn-secondary-sm">See people</a>
          <a href="/deals" className="vl-btn-secondary-sm">See deals</a>
        </div>
      </div>
      {fail.length > 0 && (
        <div className="vl-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-valence-warning" />
            <p className="text-sm font-semibold text-valence-text">Failed items</p>
          </div>
          <ul className="space-y-1 text-xs">
            {fail.map(f => {
              const e = entities.find(x => x.id === f.id)
              return (
                <li key={f.id} className="flex items-start justify-between gap-2">
                  <span className="text-valence-text">
                    <span className="font-semibold">{KIND_META[f.kind]?.label || f.kind}</span> · {e?.fields?.[KIND_META[f.kind]?.primary] || 'Unnamed'}
                  </span>
                  <span className="text-valence-danger shrink-0">{f.error}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
