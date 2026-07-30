// Bridge between gemini.js (the AI calls) and billing.js (the meter).
// Subscribes once to Gemini's onGeminiUsage and records an ai_action
// row for every successful call.
//
// Org / seat context resolution:
//   The auth gate is still off in the current build, so there's no
//   "current user" → "their seat" → "their org" chain. Until that lands,
//   this module reads a single "active org" and "active seat" from
//   localStorage, set during onboarding. If either is missing, the
//   listener no-ops — Gemini still works, just nothing gets metered.
//
// Once the multi-tenant migration lands and useAuth() returns a real
// session, replace getActiveOrgSeat() with a lookup against seats
// keyed on auth.uid().

import { supabase, isSupabaseConfigured } from './supabase.js'
import { onGeminiUsage } from './gemini.js'
import { checkAiAction, recordAiAction, AI_DECISION } from './billing.js'

const LS_ORG  = 'valence.activeOrgId'
const LS_SEAT = 'valence.activeSeatId'

function safeLocalGet(key) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage.getItem(key) || null
  } catch { return null }
}

export function getActiveOrgSeat() {
  return {
    orgId: safeLocalGet(LS_ORG),
    seatId: safeLocalGet(LS_SEAT)
  }
}

export function setActiveOrgSeat({ orgId, seatId }) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false
    if (orgId)  window.localStorage.setItem(LS_ORG, orgId);  else window.localStorage.removeItem(LS_ORG)
    if (seatId) window.localStorage.setItem(LS_SEAT, seatId); else window.localStorage.removeItem(LS_SEAT)
    return true
  } catch { return false }
}

// Gate an AI call BEFORE it fires. UI surfaces the pause message when
// decision === 'paused_awaiting_opt_in'. Returns the full decision shape
// so callers can render a status bar.
export async function gateAiAction(actionType) {
  if (!isSupabaseConfigured) return { decision: AI_DECISION.ALLOWED_PLAN_NOT_METERED }
  const { orgId, seatId } = getActiveOrgSeat()
  if (!orgId || !seatId) return { decision: AI_DECISION.ALLOWED_PLAN_NOT_METERED }
  try {
    const result = await checkAiAction(supabase, { orgId, seatId })
    return { ...result, actionType }
  } catch (e) {
    // Don't block AI when the meter is broken — log and pass.
    console.warn('gateAiAction failed', e)
    return { decision: AI_DECISION.ALLOWED_PLAN_NOT_METERED }
  }
}

// One-time subscription. Call from App.jsx so every Gemini call across
// the app records into ai_actions automatically.
let _started = false
export function startAiMeter() {
  if (_started) return () => {}
  _started = true
  return onGeminiUsage(async (usage) => {
    if (!isSupabaseConfigured) return
    const { orgId, seatId } = getActiveOrgSeat()
    if (!orgId || !seatId) return  // no org/seat context yet — no-op
    try {
      const gate = await checkAiAction(supabase, { orgId, seatId })
      if (gate.decision !== AI_DECISION.ALLOWED_INCLUDED && gate.decision !== AI_DECISION.ALLOWED_OVERAGE) {
        // Plan doesn't meter, or the seat is paused — don't write a row.
        return
      }
      await recordAiAction(supabase, {
        orgId,
        seatId,
        cycleId: gate.cycle.id,
        actionType: usage.actionType || 'unknown',
        classification: gate.classification,
        tokensUsed: usage.totalTokens || null,
        estimatedCostUsd: usage.estimatedCostUsd || null,
        customerCostUsd: usage.customerCostUsd || null,
        keySource: usage.keySource || null,
        provider: usage.provider || null,
        model:    usage.model || null
      })
    } catch (e) {
      console.warn('AI meter record failed', e)
    }
  })
}
