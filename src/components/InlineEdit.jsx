import { useEffect, useRef, useState } from 'react'
import { Loader2, Check } from 'lucide-react'

// Click-to-edit cell. Shows the value as quiet text by default; clicking
// reveals an inline input / select / date control. Blur or Enter commits via
// the onCommit prop (async — returns a Promise). Esc cancels. A small
// indicator shows saving / saved state inline so the user doesn't have to
// guess whether the update made it.

export function InlineText({ value, onCommit, placeholder = '—', className = '' }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(0)
  const ref = useRef(null)

  useEffect(() => { setDraft(value || '') }, [value])
  useEffect(() => { if (editing) setTimeout(() => ref.current?.focus(), 10) }, [editing])

  async function commit() {
    setEditing(false)
    if ((draft || '') === (value || '')) return
    setSaving(true)
    try {
      await onCommit(draft.trim() || null)
      setSavedAt(Date.now())
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className={`group inline-flex items-center gap-1.5 rounded px-1 -mx-1 text-left hover:bg-valence-blue-soft/50 transition ${className}`}
      >
        <span className={value ? '' : 'text-valence-subtle'}>{value || placeholder}</span>
        <SaveBadge saving={saving} savedAt={savedAt} />
      </button>
    )
  }

  return (
    <input
      ref={ref}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); commit() }
        if (e.key === 'Escape') { setDraft(value || ''); setEditing(false) }
      }}
      className={`rounded border border-valence-blue/40 bg-white px-1 py-0 text-sm outline-none focus:ring-2 focus:ring-valence-blue-ring ${className}`}
    />
  )
}

export function InlineSelect({ value, options, onCommit, className = '' }) {
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(0)
  async function change(v) {
    if (v === value) return
    setSaving(true)
    try {
      await onCommit(v)
      setSavedAt(Date.now())
    } finally {
      setSaving(false)
    }
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <select
        value={value || ''}
        onChange={e => change(e.target.value)}
        className={`rounded border border-transparent bg-transparent px-1 py-0 text-sm font-semibold text-valence-text outline-none hover:border-valence-blue/30 focus:border-valence-blue/40 focus:ring-2 focus:ring-valence-blue-ring transition ${className}`}
      >
        {options.map(o => <option key={o.value || o} value={o.value || o}>{o.label || o}</option>)}
      </select>
      <SaveBadge saving={saving} savedAt={savedAt} />
    </span>
  )
}

export function InlineDate({ value, onCommit, className = '' }) {
  const [draft, setDraft] = useState(value || '')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(0)
  useEffect(() => { setDraft(value || '') }, [value])
  async function change(v) {
    setDraft(v)
    if (v === value) return
    setSaving(true)
    try {
      await onCommit(v || null)
      setSavedAt(Date.now())
    } finally {
      setSaving(false)
    }
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        type="date"
        value={draft || ''}
        onChange={e => change(e.target.value)}
        className={`rounded border border-transparent bg-transparent px-1 py-0 text-sm text-valence-text outline-none hover:border-valence-blue/30 focus:border-valence-blue/40 focus:ring-2 focus:ring-valence-blue-ring transition ${className}`}
      />
      <SaveBadge saving={saving} savedAt={savedAt} />
    </span>
  )
}

function SaveBadge({ saving, savedAt }) {
  if (saving) return <Loader2 className="h-3 w-3 animate-spin text-valence-blue" />
  if (savedAt && Date.now() - savedAt < 2000) return <Check className="h-3 w-3 text-valence-success" />
  return null
}
