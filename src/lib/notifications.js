// =============================================================================
// notifications.js — type maps + mention firing helper (Phase 20)
// =============================================================================
// Two responsibilities:
//   1. Map a notification's `type` to an icon component, a human label,
//      and a UI category. Shared between the topbar drawer and the
//      full-page /notifications view so they stay in sync.
//   2. notifyMentions() — fire `mention` notifications for users tagged
//      in a note or comment. Triggers can't see mentions (mentions live
//      in the editor's JSON output), so this runs client-side after the
//      note/comment row is saved.
// =============================================================================

import { AtSign, CheckSquare, ArrowRight, Plus, FileText, Bell, Sparkles } from 'lucide-react'
import { supabase, isSupabaseConfigured } from './supabase.js'

// ============ Type maps ============

export function iconForType(type) {
  switch (type) {
    case 'mention':           return AtSign
    case 'task_assigned':     return CheckSquare
    case 'stage_change':      return ArrowRight
    case 'new_deal':          return Plus
    case 'document_uploaded': return FileText
    case 'reminder_due':      return Bell
    default:                  return Sparkles
  }
}

export function labelForType(type) {
  return {
    mention:           'Mention',
    task_assigned:     'Task assigned',
    stage_change:      'Stage change',
    new_deal:          'New deal',
    document_uploaded: 'File uploaded',
    reminder_due:      'Reminder'
  }[type] || 'Notification'
}

// UI category buckets — used by the filter tabs. Don't conflate with the
// raw `type` enum; this is purely for grouping in the UI.
export function catForType(type) {
  if (type === 'mention') return 'mentions'
  if (type === 'task_assigned') return 'tasks'
  if (type === 'reminder_due') return 'reminders'
  // stage_change / new_deal / document_uploaded all live under 'deals'.
  return 'deals'
}

// ============ Mention firing ============

// Insert one `mention` notification per tagged user. Filters out
// self-mentions because nobody wants a notification ringing for typing
// their own name. Best-effort: errors are swallowed so a notification
// failure never kills the save flow that called us.
//
// Required args:
//   mentionedUserIds  — uuid[] pulled out of the editor's JSON content
//   actor             — { id, name } of the user doing the mentioning
//                       (we pass this in rather than reading auth.uid()
//                       again so callers can include display name in
//                       the title without an extra round-trip)
//   target            — { kind: 'kb_note' | 'deal_comment', id }
//   dealId            — uuid (optional, may be null for firm-wide notes)
//   snippet           — short plain-text excerpt for the body field
//   link              — where clicking the notification should jump to
export async function notifyMentions({
  mentionedUserIds,
  actor,
  target,
  dealId = null,
  snippet = '',
  link
}) {
  if (!isSupabaseConfigured) return
  if (!Array.isArray(mentionedUserIds) || mentionedUserIds.length === 0) return
  if (!actor?.id || !target?.kind || !target?.id) return

  const dedup = Array.from(new Set(mentionedUserIds.filter(id => id && id !== actor.id)))
  if (dedup.length === 0) return

  const actorName = actor.name || actor.email || 'Someone'
  const rows = dedup.map(uid => ({
    user_id:        uid,
    type:           'mention',
    title:          `${actorName} mentioned you`,
    body:           (snippet || '').slice(0, 140),
    actor_id:       actor.id,
    deal_id:        dealId,
    kb_note_id:     target.kind === 'kb_note'      ? target.id : null,
    deal_comment_id:target.kind === 'deal_comment' ? target.id : null,
    link:           link || (dealId ? `/deals?open=${dealId}` : '/today')
  }))

  try {
    await supabase.from('notifications').insert(rows)
  } catch { /* swallow — the calling save flow shouldn't care */ }
}

// Convenience: pull mentioned user-IDs out of a TipTap JSON doc. The
// editor lives in Phase 5 but we expose the extractor here so it can be
// imported and tested without depending on the editor module.
export function extractMentionedUserIds(doc) {
  if (!doc || typeof doc !== 'object') return []
  const ids = new Set()
  function walk(node) {
    if (!node) return
    if (node.type === 'mention' && node.attrs?.id) ids.add(node.attrs.id)
    if (Array.isArray(node.content)) node.content.forEach(walk)
  }
  walk(doc)
  return Array.from(ids)
}
