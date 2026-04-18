import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { CURRENCIES, formatMoney, formatUSDAmount } from '../lib/currency.js'

const KEY = 'valence.currency'
const CurrencyCtx = createContext(null)

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState(() => {
    try { return localStorage.getItem(KEY) || 'USD' } catch { return 'USD' }
  })

  useEffect(() => {
    try { localStorage.setItem(KEY, currency) } catch {}
  }, [currency])

  const cycle = useCallback(() => {
    setCurrency(c => {
      const i = CURRENCIES.indexOf(c)
      return CURRENCIES[(i + 1) % CURRENCIES.length]
    })
  }, [])

  const money = useCallback((usdM) => formatMoney(usdM, currency), [currency])
  const amount = useCallback((usd)  => formatUSDAmount(usd, currency), [currency])

  return (
    <CurrencyCtx.Provider value={{ currency, setCurrency, cycle, money, amount }}>
      {children}
    </CurrencyCtx.Provider>
  )
}

export function useCurrency() {
  const ctx = useContext(CurrencyCtx)
  if (!ctx) throw new Error('useCurrency outside CurrencyProvider')
  return ctx
}
