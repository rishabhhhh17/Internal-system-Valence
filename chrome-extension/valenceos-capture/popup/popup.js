// Popup controller — asks the background worker whether we're connected,
// renders the right card, and provides Connect / Disconnect actions.

const statusChip   = document.getElementById('status-chip')
const connectedEl  = document.getElementById('connected')
const disconnEl    = document.getElementById('disconnected')
const userEmailEl  = document.getElementById('user-email')
const disconnectBtn = document.getElementById('disconnect')

function setStatus(state, label) {
  statusChip.className = `status status-${state}`
  statusChip.textContent = label
}

async function refresh() {
  setStatus('unknown', 'Checking…')
  try {
    const r = await chrome.runtime.sendMessage({ type: 'GET_SESSION' })
    if (r?.connected) {
      setStatus('connected', 'Connected')
      userEmailEl.textContent = r.email || '—'
      connectedEl.hidden = false
      disconnEl.hidden = true
    } else {
      setStatus('disconnected', 'Not connected')
      connectedEl.hidden = true
      disconnEl.hidden = false
    }
  } catch (err) {
    setStatus('disconnected', 'Worker error')
    connectedEl.hidden = true
    disconnEl.hidden = false
  }
}

disconnectBtn?.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'CLEAR_SESSION' })
  refresh()
})

refresh()
