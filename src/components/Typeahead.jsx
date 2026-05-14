import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

// Generic autocomplete input. Wraps a regular <input> and floats a
// drop-down with suggestions returned by an async `fetcher(query)`. The
// parent owns the value (controlled input), so picking a suggestion is
// just a `onPick(suggestion)` callback — caller decides what to set.
//
// Suggestion shape:
//   { id, label, sub?, type?, meta? }
//
// Usage:
//   <Typeahead
//     value={form.counterparty_name}
//     onChange={v => set('counterparty_name', v)}
//     placeholder="Sumant Sinha"
//     fetcher={async q => {
//       const { data } = await supabase.from('people')
//         .select('id, full_name, company').ilike('full_name', `%${q}%`).limit(8)
//       return (data || []).map(p => ({ id: p.id, label: p.full_name, sub: p.company, type: 'person' }))
//     }}
//     onPick={s => { set('counterparty_name', s.label); set('counterparty_company', s.sub || '') }}
//   />

const DEBOUNCE_MS = 160

export default function Typeahead({
  value,
  onChange,
  fetcher,
  onPick,
  placeholder,
  className = 'vl-input',
  minChars = 2,
  renderSuggestion,
  emptyHint = 'No matches',
  // When false, the dropdown does NOT show even with focus + input. Useful
  // when the parent wants to suppress suggestions briefly (e.g. immediately
  // after picking, before the next keystroke).
  enabled = true
}) {
  const inputRef = useRef(null)
  const containerRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState([])
  const [active, setActive] = useState(0)
  const reqIdRef = useRef(0)
  const debounceRef = useRef(null)

  // Debounced fetcher. Skips when the query is too short to be useful.
  useEffect(() => {
    if (!enabled) { setItems([]); setOpen(false); return }
    const q = (value || '').trim()
    if (q.length < minChars) { setItems([]); setOpen(false); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const myReq = ++reqIdRef.current
      setLoading(true)
      try {
        const out = await fetcher(q)
        if (myReq !== reqIdRef.current) return
        setItems(Array.isArray(out) ? out.slice(0, 12) : [])
        setActive(0)
        setOpen(true)
      } catch {
        if (myReq === reqIdRef.current) { setItems([]); setOpen(false) }
      } finally {
        if (myReq === reqIdRef.current) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(debounceRef.current)
  }, [value, enabled, minChars, fetcher])

  // Close when clicking outside the input + dropdown wrapper.
  useEffect(() => {
    if (!open) return
    function onDocClick(e) {
      if (!containerRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  function handleKeyDown(e) {
    if (!open || items.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % items.length) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(i => (i - 1 + items.length) % items.length) }
    else if (e.key === 'Enter')     { e.preventDefault(); pick(items[active]) }
    else if (e.key === 'Escape')    { setOpen(false) }
  }

  function pick(suggestion) {
    if (!suggestion) return
    onPick?.(suggestion)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        onFocus={() => { if (items.length > 0) setOpen(true) }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
        spellCheck={false}
      />

      {loading && (
        <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-valence-subtle animate-spin pointer-events-none" />
      )}

      {open && enabled && (items.length > 0 || (value || '').trim().length >= minChars) && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-valence-border bg-white shadow-valence-lg"
        >
          {items.length === 0 ? (
            <li className="px-3 py-2 text-[11px] text-valence-subtle">{emptyHint}</li>
          ) : (
            items.map((s, i) => (
              <li key={s.id ?? i}>
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => pick(s)}
                  onMouseEnter={() => setActive(i)}
                  className={`block w-full px-3 py-2 text-left transition ${
                    i === active ? 'bg-valence-blue-soft' : 'hover:bg-valence-blue-soft/60'
                  }`}
                >
                  {renderSuggestion ? renderSuggestion(s) : <DefaultSuggestion s={s} />}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

function DefaultSuggestion({ s }) {
  return (
    <>
      {s.type && (
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-valence-blue">{s.type}</p>
      )}
      <p className="text-sm font-semibold text-valence-text leading-tight">{s.label}</p>
      {s.sub && <p className="mt-0.5 text-[11px] text-valence-muted leading-tight">{s.sub}</p>}
    </>
  )
}
