// Gmail capture content script.
//
// When the user opens an email thread, we inject a small "Save to
// ValenceOS" chip into the thread header. Clicking it scrapes the
// thread metadata (subject, participants, last message date, snippet
// of body) and sends it to the background worker → /api/capture.
//
// We deliberately scrape the rendered DOM rather than calling Gmail's
// API because (a) the user is already authenticated to view the thread
// they're looking at, and (b) we avoid asking for additional Gmail
// scopes — the extension can be installed without any Google OAuth
// dance of its own. The user's ValenceOS session is the only auth.
//
// Selectors target Gmail's stable internal class names. Gmail re-mints
// hashed class names rarely; if these break we'll see no chip and the
// user can report it.

const STATE = {
  observerStarted: false,
  injectedThreadIds: new WeakSet()
}

// ============ THREAD DETECTION ============
// Gmail renders open threads inside elements with role=main containing
// `[role="list"][aria-label*="ssages"]`. We watch the URL for the
// hash-based fragment that holds the thread id (#inbox/<id>) and refresh
// chips when it changes.
function currentThreadElement() {
  // The clearest anchor in modern Gmail is the subject header h2 inside
  // the open thread. We rely on the `data-thread-perm-id` attribute.
  const subject = document.querySelector('[data-legacy-thread-id], h2.hP')
  if (!subject) return null
  // Walk up to a stable container so the chip survives Gmail's re-renders.
  return subject.closest('[role="main"]') || subject.parentElement
}

function extractThread() {
  const root = currentThreadElement()
  if (!root) return null
  const subject = (root.querySelector('h2.hP')?.innerText || '').trim()
  if (!subject) return null

  // Each message in a thread sits inside `.adn.ads` (compose+collapsed).
  // We pull the LAST visible expanded message (`.adn.ads`) as the most
  // recent activity.
  const messages = Array.from(root.querySelectorAll('.adn.ads'))
  const last = messages[messages.length - 1] || null

  const participants = new Map()
  for (const m of messages) {
    const tags = m.querySelectorAll('span.gD[email], span.go[email]')
    for (const t of tags) {
      const email = (t.getAttribute('email') || '').trim().toLowerCase()
      if (!email) continue
      const name = (t.getAttribute('name') || t.innerText || '').trim()
      if (!participants.has(email)) participants.set(email, name || email)
    }
  }

  // Snippet of last message body — strip quoted reply blocks.
  let snippet = ''
  if (last) {
    const bodyEl = last.querySelector('.a3s, .ii.gt') || last
    const clone = bodyEl.cloneNode(true)
    // Remove quoted-reply blocks Gmail wraps in .gmail_quote.
    clone.querySelectorAll('.gmail_quote, blockquote').forEach(n => n.remove())
    snippet = (clone.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 480)
  }

  // Last message date from the .gH .g3 timestamp attribute (epoch ms).
  let occurredAt = null
  const stamp = last?.querySelector('.g3[title]') || last?.querySelector('.gH .g3')
  const title = stamp?.getAttribute('title')
  if (title) {
    const d = new Date(title)
    if (!Number.isNaN(d.getTime())) occurredAt = d.toISOString()
  }
  if (!occurredAt) occurredAt = new Date().toISOString()

  // Sender of the last visible message — the FIRST .gD[email] inside the
  // last message container is Gmail's "from" badge. Used server-side to
  // classify the interaction as email_sent vs email_received by comparing
  // against the authenticated user's email.
  let lastFrom = ''
  if (last) {
    const fromEl = last.querySelector('.gD[email], .go[email]')
    lastFrom = (fromEl?.getAttribute('email') || '').trim().toLowerCase()
  }

  // Stable id for dedupe — use Gmail's data-legacy-thread-id if present,
  // else fall back to the URL fragment.
  const idEl = root.querySelector('[data-legacy-thread-id]')
  const threadId = idEl?.getAttribute('data-legacy-thread-id')
    || (location.hash.split('/').pop() || '').replace(/[^A-Za-z0-9_-]/g, '')

  return {
    kind: 'gmail_thread',
    threadId,
    subject,
    occurredAt,
    snippet,
    lastFrom,
    participants: Array.from(participants.entries()).map(([email, name]) => ({ email, name }))
  }
}

// ============ CHIP UI ============
function injectChip() {
  const root = currentThreadElement()
  if (!root) return
  if (STATE.injectedThreadIds.has(root)) return
  STATE.injectedThreadIds.add(root)

  const subjectRow = root.querySelector('h2.hP')?.parentElement
  if (!subjectRow) return

  const chip = document.createElement('button')
  chip.className = 'vlcap-chip'
  chip.type = 'button'
  chip.setAttribute('data-vlcap', 'gmail')
  chip.innerHTML = `
    <span class="vlcap-dot"></span>
    <span class="vlcap-label">Save to ValenceOS</span>
  `
  chip.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation()
    handleCapture(chip)
  })

  // Slot the chip after the subject so it doesn't fight Gmail's own
  // toolbar. Reset on next thread open via the observer.
  subjectRow.appendChild(chip)
}

async function handleCapture(chip) {
  const data = extractThread()
  if (!data) {
    setChipState(chip, 'error', 'No thread detected')
    return
  }
  setChipState(chip, 'busy', 'Saving…')
  try {
    const r = await chrome.runtime.sendMessage({ type: 'CAPTURE', payload: data })
    if (r?.ok) {
      const created = r.data?.created || {}
      const bits = []
      if (created.people)       bits.push(`${created.people} contact${created.people === 1 ? '' : 's'}`)
      if (created.interaction)  bits.push('1 interaction')
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
// Gmail is a SPA; we watch DOM mutations + URL changes so the chip
// re-injects when the user opens a different thread.
function start() {
  if (STATE.observerStarted) return
  STATE.observerStarted = true
  const target = document.body
  const obs = new MutationObserver(() => {
    // Trigger inject on every mutation — the WeakSet stops dupes.
    injectChip()
  })
  obs.observe(target, { childList: true, subtree: true })
  // First pass.
  injectChip()
  // URL-based fallback: when location.hash changes the WeakSet may still
  // hold the old container — force a recheck.
  window.addEventListener('hashchange', () => setTimeout(injectChip, 250))
}

start()
