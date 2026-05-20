// Feature flags for the customer-pitch branch. Surfaces that are partially
// built or carry hollow numbers stay hidden by default; the production firm
// build flips them on via env var. Single import point so every gate reads
// the same source of truth.

const truthy = (v) => v === '1' || String(v).toLowerCase() === 'true'

// Mandate-Fit scoring, Fund-Match scoring, velocity benchmarks — anything
// that returns a number-with-a-decimal partners might quote in a meeting.
// Off on the pitch deploy until we have enough real data to defend the
// numbers. Set VITE_SHOW_METRICS=true to re-enable.
export const SHOW_METRICS = truthy(import.meta.env.VITE_SHOW_METRICS)

// "We're talking to a customer right now" mode. Hides demo-ish chrome
// (Sample data chip, Currency toggle, Tour pill) plus dangerous-without-
// key surfaces (Knowledge → Ask without a Gemini key). Set
// VITE_PITCH_MODE=true on valenceos-demo so we don't accidentally expose
// "Load sample firm" mid-walkthrough. Leave unset on Rishabh's own
// valenceos production.
export const PITCH_MODE = truthy(import.meta.env.VITE_PITCH_MODE)
