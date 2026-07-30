import { useCurrency } from '../hooks/useCurrency.jsx'
import { RATES } from '../lib/currency.js'

export default function CurrencyToggle() {
  const { currency, cycle } = useCurrency()
  const r = RATES[currency]
  return (
    <button
      onClick={cycle}
      title="Cycle currency display (USD / INR / GBP / EUR)"
      className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-valence-border bg-valence-elevated px-2.5 py-1.5 text-[11px] font-semibold text-valence-muted hover:border-valence-ink/30 hover:text-valence-text transition tabular-nums"
    >
      <span className="text-valence-text">{r.symbol}</span>
      {currency} <span className="text-valence-subtle">{r.unit}</span>
    </button>
  )
}
