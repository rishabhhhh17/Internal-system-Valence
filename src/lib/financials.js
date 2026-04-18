// Extract structured financials from a 10-K / audited report / teaser text.
// Returns:
//   {
//     currency: 'USD' | 'INR' | ...
//     years: [{ year: 2024, revenue, ebitda, ebitda_margin, net_income, gross_margin }],
//     ttm: { revenue, ebitda, ebitda_margin },
//     growth_cagr_3y: number | null,
//     notes: "short caveats about what's confident vs estimated",
//     source_summary: "one-line summary of what document this came from"
//   }

import { geminiKey, isGeminiConfigured } from './gemini.js'

const URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

export async function extractFinancials(text) {
  if (!isGeminiConfigured) throw new Error('Gemini API key required.')
  if (!text || !text.trim()) throw new Error('Empty document.')

  const prompt = `You are extracting structured financial data from an investment banking source document. Return STRICT JSON only. No preamble, no trailing commentary.

Schema (use null where unknown, never invent numbers):
{
  "currency": "USD" | "INR" | "GBP" | "EUR" | "other",
  "unit": "thousands" | "millions" | "crores" | "actual",
  "years": [
    { "year": 2024, "revenue": number|null, "ebitda": number|null, "ebitda_margin": number|null, "net_income": number|null, "gross_margin": number|null }
  ],
  "ttm": { "revenue": number|null, "ebitda": number|null, "ebitda_margin": number|null },
  "growth_cagr_3y": number|null,
  "headcount": number|null,
  "notes": "one or two sentences on confidence, caveats",
  "source_summary": "one-line summary of what kind of doc this appears to be"
}

Rules:
- Preserve the document's reporting unit in "unit". Do NOT auto-convert.
- If the doc is clearly a teaser with rough figures, that's fine — set notes accordingly.
- ebitda_margin and gross_margin are percentages (e.g. 28.5 not 0.285).
- growth_cagr_3y is a percentage.
- "years" array should be in descending year order (most recent first), limit 4 years.

DOCUMENT (truncated):
${text.slice(0, 14000)}

Return JSON only.`

  const res = await fetch(`${URL}?key=${geminiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1000 }
    })
  })
  if (!res.ok) throw new Error(`Gemini error ${res.status}`)
  const j = await res.json()
  const raw = j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
  const cleaned = raw.replace(/^```json\s*|\s*```$/g, '').trim()
  try { return JSON.parse(cleaned) }
  catch {
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (m) { try { return JSON.parse(m[0]) } catch {} }
    throw new Error('Could not parse financials as JSON.')
  }
}

export function formatMoney(n, unit = 'millions', currency = 'USD') {
  if (n == null) return '—'
  const sym = currency === 'INR' ? '₹' : currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$'
  const suffix = unit === 'thousands' ? 'k' : unit === 'millions' ? 'M' : unit === 'crores' ? ' Cr' : ''
  return `${sym}${Number(n).toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}`
}
