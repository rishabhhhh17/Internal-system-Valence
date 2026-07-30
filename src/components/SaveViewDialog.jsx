// =============================================================================
// SaveViewDialog — modal to save current filter combo as a Saved View
// =============================================================================
// Pops up from "Save view" buttons (Deals filter bar, command palette,
// etc.). Pre-fills with whatever filters are currently in the URL —
// caller passes those in via `currentFilters` prop so this component
// stays presentational.
//
// Shape:
//   <SaveViewDialog
//      open
//      onClose
//      currentFilters={ { stage: 'Mandate', sector: 'Healthcare' } }
//      defaultPipelineType="transaction"
//      onSaved={(view) => …}
//   />
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { X, Save, Loader2, Users, Lock } from 'lucide-react'
import { useSavedViews } from '../hooks/useSavedViews.js'
import { useToast } from './Toast.jsx'

// Twenty-four common emojis. Enough variety for the sidebar; no need for
// the full emoji picker library bundled in.
const EMOJI_PALETTE = [
  '⭐', '🔥', '⚡', '💼', '🏷️', '🎯',
  '📌', '🚀', '💡', '📊', '🧭', '🛠️',
  '📝', '🏆', '🌱', '🌍', '🪙', '💰',
  '🔔', '⏰', '🧪', '🏗️', '🤝', '🎲'
]

export default function SaveViewDialog({ open, onClose, currentFilters = {}, defaultPipelineType = 'all', onSaved }) {
  const { saveView } = useSavedViews()
  const toast = useToast?.() || { success: () => {}, error: () => {} }

  const [name, setName]               = useState('')
  const [emoji, setEmoji]             = useState(EMOJI_PALETTE[0])
  const [isShared, setIsShared]       = useState(false)
  const [pipelineType, setPipelineType] = useState(defaultPipelineType)
  const [saving, setSaving]           = useState(false)
  const inputRef = useRef(null)

  // Reset state every open so a stale name from a previous save doesn't
  // appear pre-filled. Auto-focus the input so the user can type
  // immediately.
  useEffect(() => {
    if (!open) return
    setName('')
    setEmoji(EMOJI_PALETTE[0])
    setIsShared(false)
    setPipelineType(defaultPipelineType)
    setSaving(false)
    // Slight delay so the modal animates in before we focus.
    const t = setTimeout(() => inputRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [open, defaultPipelineType])

  // Close on Esc — small UX nicety, costs us nothing.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  async function submit(e) {
    e?.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      const view = await saveView({
        name: name.trim(),
        emoji,
        pipeline_type: pipelineType,
        filters: currentFilters,
        is_shared: isShared
      })
      toast.success?.(`Saved “${view.name}”`)
      onSaved?.(view)
      onClose?.()
    } catch (err) {
      toast.error?.(err?.message || 'Could not save view')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  // Render filter-summary chips so the user knows exactly what they're
  // saving. If the filter set is empty, show a helpful note so they
  // don't accidentally save an "empty" view.
  const summaryChips = []
  if (currentFilters.stage)        summaryChips.push(`stage: ${currentFilters.stage}`)
  if (currentFilters.sector)       summaryChips.push(`sector: ${currentFilters.sector}`)
  if (Array.isArray(currentFilters.deal_types) && currentFilters.deal_types.length) summaryChips.push(`type: ${currentFilters.deal_types.join('/')}`)
  if (currentFilters.deal_subtype) summaryChips.push(`subtype: ${String(currentFilters.deal_subtype).replace(/_/g, ' ')}`)
  if (currentFilters.nda_status)   summaryChips.push(`NDA: ${currentFilters.nda_status}`)
  if (currentFilters.ma_side)      summaryChips.push(`side: ${currentFilters.ma_side}`)
  if (currentFilters.lead_owner)   summaryChips.push(`owner: ${currentFilters.lead_owner}`)

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4" role="dialog" aria-modal="true" aria-label="Save view">
      <div className="absolute inset-0 bg-valence-ink/55 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative w-full max-w-[480px] animate-slide-up rounded-2xl border border-valence-border bg-valence-elevated shadow-valence-lg overflow-hidden"
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-valence-border">
          <div className="flex items-center gap-2">
            <Save className="h-4 w-4 text-valence-blue" />
            <h3 className="text-sm font-semibold text-valence-text">Save current filters as a view</h3>
          </div>
          <button type="button" onClick={onClose} className="grid h-7 w-7 place-items-center rounded text-valence-subtle hover:text-valence-text hover:bg-valence-surface transition" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-5 py-5 space-y-5">
          {/* Filter summary */}
          {summaryChips.length === 0 ? (
            <div className="rounded-lg border border-valence-warning/30 bg-valence-warning/10 px-3 py-2 text-xs text-valence-warning">
              No filters set. The view will show all deals — that's the same as the default pipeline.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {summaryChips.map(c => (
                <span key={c} className="inline-flex items-center rounded-full bg-valence-blue-soft px-2 py-0.5 text-[11px] font-medium text-valence-blue">{c}</span>
              ))}
            </div>
          )}

          {/* Name */}
          <div className="space-y-1.5">
            <label className="vl-label" htmlFor="view-name">View name</label>
            <input
              ref={inputRef}
              id="view-name"
              type="text"
              className="vl-input"
              placeholder="e.g. Active Healthcare mandates"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={60}
              required
            />
          </div>

          {/* Emoji palette */}
          <div className="space-y-1.5">
            <label className="vl-label">Icon</label>
            <div className="grid grid-cols-12 gap-1">
              {EMOJI_PALETTE.map(e => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={`h-7 w-7 grid place-items-center rounded transition text-sm ${
                    emoji === e ? 'bg-valence-blue-soft ring-2 ring-valence-blue' : 'hover:bg-valence-surface'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Pipeline scope */}
          <div className="space-y-1.5">
            <label className="vl-label">Pipeline scope</label>
            <select className="vl-input" value={pipelineType} onChange={e => setPipelineType(e.target.value)}>
              <option value="all">All deals</option>
              <option value="transaction">Transaction only</option>
              <option value="advisory">Advisory only</option>
            </select>
          </div>

          {/* Shared toggle */}
          <label className="flex items-start gap-3 rounded-lg border border-valence-border bg-valence-surface px-3 py-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={isShared}
              onChange={e => setIsShared(e.target.checked)}
              className="mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-valence-text inline-flex items-center gap-1.5">
                {isShared ? <Users className="h-3 w-3 text-valence-blue" /> : <Lock className="h-3 w-3 text-valence-muted" />}
                {isShared ? 'Shared with team' : 'Private to you'}
              </p>
              <p className="mt-0.5 text-[11px] text-valence-muted">
                {isShared
                  ? 'Everyone in your firm will see this view under Team Views.'
                  : 'Only you will see this view in your sidebar.'}
              </p>
            </div>
          </label>
        </div>

        <footer className="px-5 py-3 border-t border-valence-border flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="vl-btn-ghost text-xs">Cancel</button>
          <button type="submit" disabled={!name.trim() || saving} className="vl-btn-primary text-xs">
            {saving ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</> : <><Save className="h-3 w-3" /> Save view</>}
          </button>
        </footer>
      </form>
    </div>
  )
}
