// Minimal RFC 4180 CSV parser + header-aware mapping for the People
// importer in /settings → Data. No new deps — the column-mapper UI is
// what the user actually wants; the parser is a small but correct
// helper underneath. Quoted fields, embedded commas, escaped quotes
// ("" inside a quoted field), CRLF/LF/CR line endings, and trailing
// newlines are all handled.

// ============ FIELDS THE IMPORTER CAN WRITE TO public.people ============
export const IMPORT_FIELDS = [
  { key: 'full_name',    label: 'Full name',    required: true,  aliases: ['name', 'fullname', 'full name', 'contact name', 'contact'] },
  { key: 'role',         label: 'Role',         aliases: ['title', 'position', 'job title', 'designation'] },
  { key: 'company',      label: 'Company',      aliases: ['organization', 'organisation', 'employer', 'firm'] },
  { key: 'email',        label: 'Email',        aliases: ['email address', 'e-mail', 'mail'] },
  { key: 'phone',        label: 'Phone',        aliases: ['phone number', 'mobile', 'cell', 'tel', 'telephone'] },
  { key: 'linkedin_url', label: 'LinkedIn URL', aliases: ['linkedin', 'linkedin profile', 'li', 'linkedin url'] },
  { key: 'whatsapp',     label: 'WhatsApp',     aliases: ['whatsapp number', 'wa'] },
  { key: 'city',         label: 'City',         aliases: ['town'] },
  { key: 'country',      label: 'Country',      aliases: ['nation'] },
  { key: 'tags',         label: 'Tags',         aliases: ['labels', 'segments', 'group'], isArray: true }
]

export const SKIP_COLUMN = '__skip__'

export function parseCSV(text) {
  if (typeof text !== 'string') return { headers: [], rows: [] }
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1) // strip BOM

  const rows = []
  let current = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }
    // outside quotes
    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === ',') {
      current.push(field)
      field = ''
      i++
      continue
    }
    if (ch === '\r') {
      // CR or CRLF — both close the record
      current.push(field)
      rows.push(current)
      current = []
      field = ''
      if (text[i + 1] === '\n') i += 2
      else i++
      continue
    }
    if (ch === '\n') {
      current.push(field)
      rows.push(current)
      current = []
      field = ''
      i++
      continue
    }
    field += ch
    i++
  }
  // flush final field/row if not terminated by newline
  if (field.length > 0 || current.length > 0) {
    current.push(field)
    rows.push(current)
  }

  if (rows.length === 0) return { headers: [], rows: [] }
  const headers = rows[0].map(h => h.trim())
  // Drop any all-empty body rows — they're trailing-newline junk or
  // gaps in the source, never meaningful contact records.
  const body = rows.slice(1)
    .filter(r => r.some(v => v !== ''))
    .map(r => {
    // Pad short rows so column-mapping is stable
    const padded = r.slice()
    while (padded.length < headers.length) padded.push('')
    return padded
  })
  return { headers, rows: body }
}

function normalizeHeader(h) {
  return String(h || '').toLowerCase().replace(/[\s_\-]+/g, ' ').trim()
}

// Best-guess header → field key map. Headers we can't place return
// SKIP_COLUMN so the UI shows them as skipped by default.
export function inferMapping(headers) {
  const used = new Set()
  const out = {}
  for (const h of headers) {
    const norm = normalizeHeader(h)
    if (!norm) { out[h] = SKIP_COLUMN; continue }
    let match = null
    for (const f of IMPORT_FIELDS) {
      if (used.has(f.key)) continue
      const candidates = [f.key, f.label, ...(f.aliases || [])].map(normalizeHeader)
      if (candidates.includes(norm)) { match = f.key; break }
    }
    if (match) {
      out[h] = match
      used.add(match)
    } else {
      out[h] = SKIP_COLUMN
    }
  }
  return out
}

// Take parsed rows + a mapping and produce insertable objects plus
// per-row validation errors. Tags are split on `,` and trimmed.
export function mapRows(rows, headers, mapping) {
  const cols = headers.map(h => mapping[h] || SKIP_COLUMN)
  const out = []
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    const insertable = {}
    for (let c = 0; c < cols.length; c++) {
      const key = cols[c]
      if (key === SKIP_COLUMN) continue
      const raw = (row[c] ?? '').trim()
      if (!raw) continue
      const field = IMPORT_FIELDS.find(f => f.key === key)
      if (field?.isArray) {
        insertable[key] = raw.split(/[,;]/).map(s => s.trim()).filter(Boolean)
      } else {
        insertable[key] = raw
      }
    }
    const errors = []
    for (const f of IMPORT_FIELDS) {
      if (f.required && !insertable[f.key]) errors.push(`Missing ${f.label}`)
    }
    out.push({ rawIndex: r, insertable, errors })
  }
  return out
}

export function summarizeMapping(mapping) {
  const counts = { mapped: 0, skipped: 0 }
  for (const key of Object.values(mapping)) {
    if (key === SKIP_COLUMN) counts.skipped += 1
    else counts.mapped += 1
  }
  return counts
}
