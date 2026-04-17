import { supabase, isSupabaseConfigured } from './supabase.js'

// Writes an activity log entry for a deal. Fails silently in demo mode — the
// UI is expected to update local state anyway.
export async function logActivity({ dealId, kind, body }) {
  if (!isSupabaseConfigured || !dealId) return null
  const { data, error } = await supabase
    .from('activities')
    .insert({ deal_id: dealId, kind, body })
    .select().single()
  if (error) {
    console.warn('activity log failed', error)
    return null
  }
  return data
}

export const ACTIVITY_LABELS = {
  created:        'Deal created',
  stage_change:   'Stage changed',
  note:           'Note added',
  nda_signed:     'NDA signed',
  teaser_sent:    'Teaser sent',
  meeting:        'Meeting logged',
  file_upload:    'File uploaded',
  email_drafted:  'Email drafted',
  contact_added:  'Counterparty added',
  brief_generated:'Brief generated'
}
