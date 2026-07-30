// All money in the app is stored in USD millions. This lib converts + formats
// for display in the viewer's preferred currency. The conversion rates are
// intentionally static (editable per-firm) — real firms work off fixed-for-
// the-quarter reference rates, not live FX.

// USD per 1 unit of the given currency's display unit:
//   USD  → 1 M USD
//   INR  → 1 Cr INR  ≈ 0.12 M USD (i.e. 1 M USD ≈ 8.3 Cr INR)
//   GBP  → 1 M GBP
//   EUR  → 1 M EUR
export const RATES = {
  USD: { symbol: '$',  unit: 'M',  usdPerDisplayUnit: 1        },
  INR: { symbol: '₹',  unit: 'Cr', usdPerDisplayUnit: 1 / 8.3  },
  GBP: { symbol: '£',  unit: 'M',  usdPerDisplayUnit: 1 / 0.78 },
  EUR: { symbol: '€',  unit: 'M',  usdPerDisplayUnit: 1 / 0.92 }
}

export const CURRENCIES = Object.keys(RATES)

export function formatMoney(usdM, currency = 'USD', { forceSign = false } = {}) {
  if (usdM == null || isNaN(usdM)) return '—'
  const r = RATES[currency] || RATES.USD
  const display = usdM / r.usdPerDisplayUnit
  const abs = Math.abs(display)
  const precision = abs >= 100 ? 0 : abs >= 10 ? 1 : 2
  const sign = forceSign && display > 0 ? '+' : ''
  return `${sign}${r.symbol}${display.toLocaleString(undefined, {
    maximumFractionDigits: precision,
    minimumFractionDigits: precision === 0 ? 0 : 0
  })}${r.unit ? ` ${r.unit}` : ''}`.trim()
}

// For large aggregate USD amounts (the expected-fees stat, etc.)
export function formatUSDAmount(usd, currency = 'USD') {
  if (!usd || isNaN(usd) || usd < 1) return formatMoney(0, currency)
  return formatMoney(usd / 1_000_000, currency)
}
