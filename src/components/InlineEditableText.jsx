import { useEffect, useRef, useState } from 'react'
import { Pencil, Check, Loader2 } from 'lucide-react'

// Click-to-edit text element. Used wherever the user should be able to
// rename a thing in place — deal client_name, person full_name, fund name,
// folder names — without opening a separate Edit modal.
//
// API:
//   value     — current text
//   onSave    — async (next: string) => void. May throw; component reverts
//               draft on throw.
//   className — applied to both the display button and the input so the
//               inline editor visually replaces the static text without
//               layout shift.
//   placeholder — shown when value is empty (still clickable to edit)
//
// Keys: Enter saves, Escape cancels, click-outside saves.
// Empty / whitespace-only drafts revert to the previous value silently.

export default function InlineEditableText({
  value,
  onSave,
  className = '',
  placeholder = 'Click to set a name',
  disabled = false
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef(null)

  // Keep draft in sync if the parent updates the value while we aren't editing.
  useEffect(() => { if (!editing) setDraft(value || '') }, [value, editing])

  useEffect(() => {
    if (editing) {
      const t = setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 0)
      return () => clearTimeout(t)
    }
  }, [editing])

  async function commit() {
    const next = (draft || '').trim()
    if (!next || next === (value || '')) {
      setDraft(value || '')
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onSave?.(next)
      setEditing(false)
    } catch {
      // Revert to the last known good value on save failure. The toast
      // shown by the onSave caller surfaces the actual error.
      setDraft(value || '')
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setDraft(value || '')
    setEditing(false)
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5 min-w-0">
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            else if (e.key === 'Escape') { e.preventDefault(); cancel() }
          }}
          disabled={saving}
          placeholder={placeholder}
          className={`${className} bg-valence-elevated border border-valence-blue/40 rounded px-1.5 -mx-1.5 outline-none focus:ring-2 focus:ring-valence-blue-ring min-w-0 flex-1`}
        />
        {saving
          ? <Loader2 className="h-3.5 w-3.5 animate-spin text-valence-muted shrink-0" />
          : <Check className="h-3.5 w-3.5 text-valence-success shrink-0" />}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => !disabled && setEditing(true)}
      disabled={disabled}
      title={disabled ? value : 'Click to rename'}
      className={`group inline-flex items-center gap-1.5 min-w-0 cursor-text rounded px-1.5 -mx-1.5 hover:bg-valence-surface/70 transition text-left ${className}`}
    >
      <span className="truncate">{value || placeholder}</span>
      <Pencil className="h-3 w-3 text-valence-subtle opacity-0 group-hover:opacity-100 transition shrink-0" aria-hidden />
    </button>
  )
}
