import { useState } from 'react'
import { Mail, Loader2, RefreshCw } from 'lucide-react'
import { syncGmailActivity } from '../lib/gmailSync.js'
import { useAuth } from '../hooks/useAuth.js'
import { GoogleAuthExpired, signInWithGoogle } from '../lib/google.js'
import { humanError } from '../lib/userError.js'
import { useToast } from './Toast.jsx'

export default function GmailSyncButton({ dealId, onSynced }) {
  const toast = useToast()
  const { googleConnected } = useAuth()
  const [busy, setBusy] = useState(false)
  const [label, setLabel] = useState('')

  async function run() {
    if (!googleConnected) {
      toast.error('Connect Google first (top right).')
      return
    }
    setBusy(true)
    try {
      const r = await syncGmailActivity({
        dealId, days: 60,
        onProgress: ({ label }) => setLabel(label || '')
      })
      if (r.reason) {
        toast.info(r.reason)
      } else {
        toast.success(`${r.added} new email${r.added === 1 ? '' : 's'} logged (scanned ${r.scanned}).`)
        onSynced?.()
      }
    } catch (e) {
      if (e instanceof GoogleAuthExpired) {
        toast.error('Google session expired. Reconnect to continue.')
        signInWithGoogle().catch(() => {})
      } else {
        toast.error(humanError(e, 'Gmail sync failed'))
      }
    } finally {
      setBusy(false); setLabel('')
    }
  }

  return (
    <button onClick={run} disabled={busy} className="vl-btn-secondary" title="Pull recent Gmail activity for counterparties on this deal">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
      {busy ? (label || 'Syncing…') : 'Sync Gmail'}
    </button>
  )
}
