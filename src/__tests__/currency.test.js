import { describe, it, expect } from 'vitest'
import { RATES, formatMoney, formatUSDAmount } from '../lib/currency.js'

describe('currency', () => {
  describe('RATES', () => {
    it('exposes the four supported currencies', () => {
      expect(Object.keys(RATES).sort()).toEqual(['EUR', 'GBP', 'INR', 'USD'])
    })

    it('uses Cr unit for INR, M for others', () => {
      expect(RATES.INR.unit).toBe('Cr')
      expect(RATES.USD.unit).toBe('M')
      expect(RATES.GBP.unit).toBe('M')
      expect(RATES.EUR.unit).toBe('M')
    })
  })

  describe('formatMoney', () => {
    it('returns em-dash for null / NaN', () => {
      expect(formatMoney(null)).toBe('—')
      expect(formatMoney(undefined)).toBe('—')
      expect(formatMoney(NaN)).toBe('—')
    })

    it('formats USD millions with correct precision', () => {
      expect(formatMoney(420, 'USD')).toBe('$420 M')
      expect(formatMoney(42.5, 'USD')).toBe('$42.5 M')
      expect(formatMoney(4.25, 'USD')).toBe('$4.25 M')
    })

    it('converts USD millions to INR crore (~8.3x)', () => {
      // 420 USD M ÷ (1/8.3) = 3486 Cr
      const v = formatMoney(420, 'INR')
      expect(v).toMatch(/₹.*Cr/)
      // Precision: 3486 is >= 100 so no decimals
      expect(v).toBe('₹3,486 Cr')
    })

    it('converts USD to GBP using the configured rate', () => {
      // 100 USD M ÷ (1/0.78) = 78 GBP M
      expect(formatMoney(100, 'GBP')).toBe('£78 M')
    })

    it('converts USD to EUR using the configured rate', () => {
      // 100 USD M ÷ (1/0.92) = 92 EUR M
      expect(formatMoney(100, 'EUR')).toBe('€92 M')
    })

    it('supports forceSign for positive amounts', () => {
      expect(formatMoney(5, 'USD', { forceSign: true })).toMatch(/^\+/)
      expect(formatMoney(-5, 'USD', { forceSign: true })).not.toMatch(/^\+/)
    })

    it('falls back to USD for unknown currency codes', () => {
      expect(formatMoney(100, 'JPY')).toBe(formatMoney(100, 'USD'))
    })
  })

  describe('formatUSDAmount', () => {
    it('returns 0 of the chosen currency when zero', () => {
      expect(formatUSDAmount(0)).toBe(formatMoney(0))
      expect(formatUSDAmount(null, 'GBP')).toContain('£')
    })

    it('divides by 1M before formatting (7.35M fees → $7.35M)', () => {
      expect(formatUSDAmount(7_350_000, 'USD')).toBe('$7.35 M')
    })
  })
})
