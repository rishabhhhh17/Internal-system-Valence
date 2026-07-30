// Measure the (top,left) of a specific character position inside a textarea,
// in pixels relative to the textarea's top-left content area (so the same
// coordinate system as `position: absolute` against a `position: relative`
// container that holds the textarea).
//
// Technique: stamp a hidden <div> with the exact same font / box / wrap rules
// as the textarea, fill it with the text up to the position, append a marker
// <span>, read the span's offset. This is the textarea-caret-position trick
// (Jonathan Ong's library and the variants used in Linear / Notion / Slack).
//
// We re-create the mirror div on every call rather than caching it because:
//   (1) the textarea's geometry can change between calls (resize handle,
//       container reflow), and
//   (2) call frequency is "every keystroke that opens the picker," not every
//       frame — the cost is invisible against React's render budget.

const MIRROR_PROPS = [
  'direction',
  'boxSizing',
  'width', 'height',
  'overflowX', 'overflowY',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontSizeAdjust',
  'lineHeight', 'fontFamily',
  'textAlign', 'textTransform', 'textIndent', 'textDecoration',
  'letterSpacing', 'wordSpacing',
  'tabSize'
]

export function caretCoordinates(textarea, position) {
  if (typeof window === 'undefined' || !textarea) {
    return { top: 0, left: 0, lineHeight: 18 }
  }

  const computed = window.getComputedStyle(textarea)
  const mirror = document.createElement('div')
  // Off-screen but laid out — visibility:hidden keeps it out of the AT tree.
  mirror.setAttribute('aria-hidden', 'true')
  const s = mirror.style
  s.position = 'absolute'
  s.top = '0'
  s.left = '-9999px'
  s.visibility = 'hidden'
  s.whiteSpace = 'pre-wrap'
  s.wordWrap = 'break-word'
  // Mirror the box exactly.
  for (const p of MIRROR_PROPS) {
    try { s[p] = computed[p] } catch { /* readonly in some envs */ }
  }
  // Height must autosize to the content for offsetTop to be meaningful.
  s.height = 'auto'

  document.body.appendChild(mirror)

  // Text content up to the caret. The marker span carries the rest (or a
  // sentinel character) so its offsets correspond to "what comes next."
  mirror.textContent = textarea.value.substring(0, position)

  const marker = document.createElement('span')
  // Use a single character so the span has measurable dimensions. Browsers
  // collapse zero-width content otherwise.
  const trailing = textarea.value.substring(position) || '.'
  marker.textContent = trailing
  mirror.appendChild(marker)

  const borderTop  = parseFloat(computed.borderTopWidth)  || 0
  const borderLeft = parseFloat(computed.borderLeftWidth) || 0
  const lineHeight = parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.2 || 18

  const coords = {
    top:  marker.offsetTop  + borderTop,
    left: marker.offsetLeft + borderLeft,
    lineHeight
  }

  document.body.removeChild(mirror)
  return coords
}
