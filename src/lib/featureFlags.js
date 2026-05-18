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
