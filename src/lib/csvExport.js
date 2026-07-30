// CSV export — RFC-4180 safe serializer + a tiny browser helper to fire
// the download. Pure functions so the encoding is testable in isolation;
// the download wrapper is intentionally thin.

function needsQuoting(s) {
  return /[",\r\n]/.test(s)
}

function escapeCell(value) {
  if (value === null || value === undefined) return ''
  // Arrays → semicolon-joined (tags, reasons). Lets a partner re-import
  // into the same column without it being parsed as multi-cell.
  if (Array.isArray(value)) return escapeCell(value.join('; '))
  // Dates → ISO. Anything else → String()
  let s
  if (value instanceof Date) s = value.toISOString()
  else if (typeof value === 'object') s = JSON.stringify(value)
  else s = String(value)
  // Strip leading '=' / '+' / '-' / '@' that Excel interprets as a formula
  // (CSV injection). Common defensive trick.
  if (s.length > 0 && '=+-@'.includes(s[0])) s = `'${s}`
  if (!needsQuoting(s)) return s
  return `"${s.replace(/"/g, '""')}"`
}

// columns is `[{ key, label }]` — order is preserved, label shown in the
// header row, key looked up on each row.
export function toCSV(rows, columns) {
  if (!Array.isArray(rows) || !Array.isArray(columns) || columns.length === 0) return ''
  const header = columns.map(c => escapeCell(c.label ?? c.key)).join(',')
  const body = rows.map(r => columns.map(c => escapeCell(r?.[c.key])).join(','))
  return [header, ...body].join('\r\n')
}

export function downloadCSV(filename, csvText) {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return false
  // Prepend a UTF-8 BOM so Excel auto-detects the encoding for non-ASCII
  // names (₹ symbols, accented characters).
  const blob = new Blob(['﻿', csvText], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 0)
  return true
}

// Convenience: ISO-friendly stamp for filenames.
export function timestampedFilename(stem, ext = 'csv') {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  return `${stem}-${stamp}.${ext}`
}
