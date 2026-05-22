// Google Calendar capture content script.
//
// When the user clicks an event and Google Calendar opens the event
// detail panel (popup or full view), we inject a chip into the panel
// that captures the event into ValenceOS:
//   - Each attendee becomes a Person
//   - The event itself becomes an Interaction (type='meeting')
// Same auth model as the Gmail script — the user's ValenceOS session
// in the background worker is the only credential.

const STATE = { injected: new WeakSet() }

// ============ EVENT PANEL DETECTION ============
// Calendar's event detail panel has role=dialog with a heading that
// matches the event title. The simplest stable signal is the panel
// labelled by "Event details" or containing the join-with-meet anchor.
function eventPanel() {
  // Popup view (clicking a chip in the grid) — role="dialog" with the
  // event title in a heading.
  const dialog = document.querySelector('[role="dialog"][aria-label]:not([aria-hidden="true"])')
  if (dialog && dialog.querySelector('h2, h1')) return dialog
  // Full-page event view (clicking "More options" or opening from search).
  const main = document.querySelector('main [role="main"]')
  if (main && /\/event/.test(location.pathname + location.search)) return main
  return null
}

function extractEvent() {
  const panel = eventPanel()
  if (!panel) return null

  const title = (panel.querySelector('h2, h1')?.innerText || '').trim()
  if (!title) return null

  // Attendees — Calendar lists them under role=list with each having a
  // span containing the email. Selector targets the "Guests" or
  // "Attendees" section heading sibling.
  const attendeeEls = panel.querySelectorAll('[data-email], [data-hovercard-id]')
  const attendees = new Map()
  for (const a of attendeeEls) {
    const email = (a.getAttribute('data-email') || a.getAttribute('data-hovercard-id') || '').trim().toLowerCase()
    if (!email || !email.includes('@')) continue
    if (attendees.has(email)) continue
    const name = (a.getAttribute('aria-label') || a.innerText || '').replace(/\s+/g, ' ').trim()
    attendees.set(email, name || email)
  }

  // Start / end times — Calendar exposes these as readable strings in
  // the time row. We capture the raw text; the backend tries to parse.
  const timeText = (() => {
    const candidates = Array.from(panel.querySelectorAll('div, span'))
      .map(el => el.innerText?.trim() || '')
      .filter(t => /(\d{1,2}:\d{2}\s*(am|pm)?)/i.test(t) && t.length < 120)
    return candidates[0] || ''
  })()

  // Location / description snippets — pulled best-effort.
  const locationEl = panel.querySelector('[aria-label^="Location"], [aria-label^="Joining info"]')
  const location = locationEl?.innerText?.trim() || ''

  // Stable event id — Calendar URLs have eid= for clicked events.
  let eventId = ''
  const m = location.search ? location.search : ''
  const urlMatch = window.location.href.match(/eid=([A-Za-z0-9_-]+)/)
  if (urlMatch) eventId = urlMatch[1]
  if (!eventId) eventId = `${title}|${timeText}`.slice(0, 200)

  return {
    kind: 'gcal_event',
    eventId,
    title,
    occurredAt: new Date().toISOString(),  // backend will refine if it can parse timeText
    timeText,
    location,
    attendees: Array.from(attendees.entries()).map(([email, name]) => ({ email, name }))
  }
}

// ============ CHIP UI ============
function injectChip() {
  const panel = eventPanel()
  if (!panel) return
  if (STATE.injected.has(panel)) return
  STATE.injected.add(panel)

  const heading = panel.querySelector('h2, h1')
  if (!heading) return
  const slot = heading.parentElement || panel

  const chip = document.createElement('button')
  chip.className = 'vlcap-chip'
  chip.type = 'button'
  chip.setAttribute('data-vlcap', 'gcal')
  chip.innerHTML = `
    <span class="vlcap-dot"></span>
    <span class="vlcap-label">Save to ValenceOS</span>
  `
  chip.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation()
    handleCapture(chip)
  })
  slot.appendChild(chip)
}

async function handleCapture(chip) {
  const data = extractEvent()
  if (!data) { setChipState(chip, 'error', 'No event detected'); return }
  setChipState(chip, 'busy', 'Saving…')
  try {
    const r = await chrome.runtime.sendMessage({ type: 'CAPTURE', payload: data })
    if (r?.ok) {
      const created = r.data?.created || {}
      const bits = []
      if (created.people)      bits.push(`${created.people} attendee${created.people === 1 ? '' : 's'}`)
      if (created.interaction) bits.push('1 meeting')
      setChipState(chip, 'ok', bits.length ? `Saved · ${bits.join(' · ')}` : 'Saved')
    } else {
      setChipState(chip, 'error', r?.error || 'Save failed')
    }
  } catch (err) {
    setChipState(chip, 'error', err?.message || 'Save failed')
  }
}

function setChipState(chip, state, label) {
  chip.dataset.state = state
  const lab = chip.querySelector('.vlcap-label')
  if (lab) lab.textContent = label
  if (state === 'ok' || state === 'error') {
    setTimeout(() => {
      chip.dataset.state = ''
      const l2 = chip.querySelector('.vlcap-label')
      if (l2) l2.textContent = 'Save to ValenceOS'
    }, 4500)
  }
}

// ============ OBSERVER ============
function start() {
  const obs = new MutationObserver(() => injectChip())
  obs.observe(document.body, { childList: true, subtree: true })
  injectChip()
}
start()
