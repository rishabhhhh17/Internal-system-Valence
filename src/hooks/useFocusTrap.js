import { useEffect } from 'react'

// useFocusTrap — keep keyboard focus inside an overlay (Modal / Drawer /
// Palette) while it's open, and restore focus to the element that
// triggered the open when the overlay closes.
//
// Why this matters: without a trap, pressing Tab inside the New-Person
// drawer eventually leaves the drawer and lands on the dimmed Sidebar /
// Topbar links behind the overlay — the prospect can see focus rings
// hopping into "ghost" controls they can't actually interact with, and
// the page underneath quietly accepts shortcut keys. Esc-to-close still
// works regardless (the host component already listens for it).
//
// Usage:
//   const panelRef = useRef(null)
//   useFocusTrap(panelRef, open)
//   return <div ref={panelRef}>…</div>
//
// Implementation notes:
//   - We snapshot document.activeElement when the trap engages, and
//     restore focus to it on cleanup. If the trigger was unmounted in
//     the interim (rare), restore is a no-op.
//   - Focus moves to the first focusable child on mount. Inputs with
//     `autoFocus` will steal it back on their own render — that's fine,
//     they get priority.
//   - Standard focusable selector — same set most a11y libraries use.
//     We filter out anything with `disabled` or `aria-hidden="true"`.

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable]',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

function getFocusable(container) {
  if (!container) return []
  const all = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR))
  return all.filter(el => !el.hasAttribute('aria-hidden') && !el.closest('[hidden]'))
}

export function useFocusTrap(containerRef, active) {
  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return

    const previouslyFocused = document.activeElement

    // Focus the first focusable child on the next tick so any
    // autoFocus-marked input has already grabbed focus first.
    const t = setTimeout(() => {
      if (container.contains(document.activeElement)) return
      const focusables = getFocusable(container)
      if (focusables[0]) focusables[0].focus()
    }, 0)

    function onKey(e) {
      if (e.key !== 'Tab') return
      const focusables = getFocusable(container)
      if (focusables.length === 0) {
        e.preventDefault()
        return
      }
      const first = focusables[0]
      const last  = focusables[focusables.length - 1]
      const activeEl = document.activeElement
      // Tab from the last element loops to the first;
      // Shift+Tab from the first loops to the last.
      if (e.shiftKey && activeEl === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault()
        first.focus()
      } else if (!container.contains(activeEl)) {
        // Focus escaped (shouldn't happen, but defensive) — pull it back.
        e.preventDefault()
        first.focus()
      }
    }

    // capture: catch Tab before the page-level handlers see it.
    document.addEventListener('keydown', onKey, true)

    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey, true)
      // Restore focus to whatever opened us, but only if the element is
      // still in the document. Otherwise leave focus alone — the user
      // probably navigated and we don't want to yank them back.
      if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
        previouslyFocused.focus()
      }
    }
  }, [active, containerRef])
}
