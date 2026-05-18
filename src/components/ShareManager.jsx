import { useEffect, useState } from 'react'
import { formatDistanceToNow, format } from 'date-fns'
import { Link2, Plus, Copy, Check, Trash2, Ban, Eye, Loader2, FileText, Globe } from 'lucide-react'
import Modal from './Modal.jsx'
import { createShare, listShares, revokeShare, deleteShare, shareUrl, listAccess } from '../lib/shares.js'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from './Toast.jsx'
import { useConfirm } from './ConfirmDialog.jsx'

export default function ShareManager({ deal }) {
  const toast = useToast()
  const confirm = useConfirm()
  const { profile } = useAuth()
  const [shares, setShares] = useState([])
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [logOpen, setLogOpen] = useState(null) // share id for access log
  const [access, setAccess] = useState([])

  useEffect(() => { if (deal?.id) load() }, [deal?.id])

  async function load() {
    setLoading(true)
    try {
      if (!isSupabaseConfigured) { setShares([]); setFiles([]); setLoading(false); return }
      const [s, f] = await Promise.all([
        listShares(deal.id),
        supabase.from('deal_files').select('*').eq('deal_id', deal.id).order('created_at', { ascending: false })
      ])
      setShares(s)
      setFiles(f.data || [])
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(form) {
    try {
      const row = await createShare({
        dealId: deal.id,
        title:          form.title,
        recipientName:  form.recipientName,
        recipientEmail: form.recipientEmail,
        fileIds:        form.fileIds,
        note:           form.note,
        expiresAt:      form.expiresAt,
        createdBy:      profile?.email || null
      })
      toast.success('Share link created.')
      setModal(false)
      setShares(prev => [row, ...prev])
      // Auto-copy URL to clipboard
      try {
        await navigator.clipboard.writeText(shareUrl(row.share_code))
        toast.info('Link copied to clipboard.')
      } catch {}
    } catch (e) {
      toast.error(e.message || 'Could not create share.')
    }
  }

  async function handleRevoke(s) {
    const ok = await confirm({ title: 'Revoke share?', body: 'Anyone with the link will lose access immediately.', destructive: true, confirmLabel: 'Revoke' })
    if (!ok) return
    try {
      await revokeShare(s.id)
      setShares(prev => prev.map(x => x.id === s.id ? { ...x, revoked: true } : x))
      toast.success('Revoked.')
    } catch (e) { toast.error(e.message) }
  }

  async function handleDelete(s) {
    const ok = await confirm({ title: 'Delete this share?', body: 'The link and access log will be permanently removed.', destructive: true, confirmLabel: 'Delete' })
    if (!ok) return
    try {
      await deleteShare(s.id)
      setShares(prev => prev.filter(x => x.id !== s.id))
      toast.success('Deleted.')
    } catch (e) { toast.error(e.message) }
  }

  async function viewLog(s) {
    setLogOpen(s)
    try {
      const data = await listAccess(s.id)
      setAccess(data)
    } catch (e) { toast.error(e.message) }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-valence-border bg-gradient-to-br from-valence-blue-soft via-white to-white p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-valence-blue-soft ring-1 ring-valence-blue/30 shrink-0">
            <Globe className="h-4 w-4 text-valence-blue" />
          </div>
          <div className="flex-1">
            <p className="font-display text-lg font-semibold text-valence-text">External data room</p>
            <p className="mt-1 text-xs text-valence-muted leading-relaxed">
              Generate a shareable link for counterparties. Choose which files they see, set an expiry, revoke any time. Every view is logged.
            </p>
          </div>
          <button onClick={() => setModal(true)} className="vl-btn-accent shrink-0">
            <Plus className="h-4 w-4" /> New link
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-20 rounded-xl bg-valence-surface animate-pulse" />)}
        </div>
      ) : shares.length === 0 ? (
        <div className="rounded-xl border border-dashed border-valence-border bg-valence-surface px-5 py-8 text-center">
          <Link2 className="mx-auto h-4 w-4 text-valence-subtle" />
          <p className="mt-2 text-sm text-valence-muted">No shared links yet. Create one to give a counterparty access.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {shares.map(s => <ShareRow key={s.id} share={s} onRevoke={() => handleRevoke(s)} onDelete={() => handleDelete(s)} onViewLog={() => viewLog(s)} />)}
        </ul>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Create share link" description="Choose what the recipient can see." size="lg">
        <ShareForm files={files} onCancel={() => setModal(false)} onSubmit={handleCreate} dealName={deal?.client_name} />
      </Modal>

      <Modal open={Boolean(logOpen)} onClose={() => { setLogOpen(null); setAccess([]) }} title="Access log" size="md">
        {logOpen && (
          <div className="space-y-3">
            <p className="text-[11px] text-valence-muted">Every view and download is recorded automatically.</p>
            {access.length === 0 ? (
              <p className="text-sm text-valence-muted">No opens yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {access.map(e => (
                  <li key={e.id} className="rounded-lg border border-valence-border bg-valence-elevated px-3 py-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-valence-text capitalize">{e.event}</span>
                      <span className="text-valence-muted">{formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}</span>
                    </div>
                    {e.user_agent && <p className="mt-1 truncate text-valence-subtle">{e.user_agent}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

function ShareRow({ share, onRevoke, onDelete, onViewLog }) {
  const [copied, setCopied] = useState(false)
  const url = shareUrl(share.share_code)
  const expired = share.expires_at && new Date(share.expires_at) < new Date()
  const dead = share.revoked || expired

  async function copy() {
    await navigator.clipboard.writeText(url)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  return (
    <li className={`vl-card p-4 ${dead ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <div className={`grid h-9 w-9 place-items-center rounded-lg shrink-0 ${dead ? 'bg-valence-surface ring-1 ring-valence-border' : 'bg-valence-blue-soft ring-1 ring-valence-blue/20'}`}>
          <Link2 className={`h-4 w-4 ${dead ? 'text-valence-subtle' : 'text-valence-blue'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-valence-text">{share.title || share.recipient_name || 'Untitled share'}</p>
            {share.recipient_email && <span className="vl-chip">{share.recipient_email}</span>}
            {share.revoked   && <span className="inline-flex items-center gap-1 rounded-full border border-valence-danger/30 bg-valence-danger-soft px-2 py-0.5 text-[10px] font-semibold text-valence-danger">Revoked</span>}
            {expired && !share.revoked && <span className="inline-flex items-center gap-1 rounded-full border border-valence-warning/30 bg-valence-warning-soft px-2 py-0.5 text-[10px] font-semibold text-valence-warning">Expired</span>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-valence-muted">
            <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" />{(share.file_ids || []).length || 'all'} file{(share.file_ids || []).length === 1 ? '' : 's'}</span>
            <span>· created {formatDistanceToNow(new Date(share.created_at), { addSuffix: true })}</span>
            {share.expires_at && <span>· expires {format(new Date(share.expires_at), 'd MMM yyyy')}</span>}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input value={url} readOnly className="vl-input font-mono text-[11px]" onFocus={e => e.target.select()} />
            <button onClick={copy} className="vl-btn-secondary">
              {copied ? <><Check className="h-3.5 w-3.5 text-valence-success" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
            </button>
            <button onClick={onViewLog} className="vl-btn-ghost"><Eye className="h-3.5 w-3.5" /> Log</button>
            {!share.revoked && <button onClick={onRevoke} className="vl-btn-ghost text-valence-warning hover:text-valence-warning"><Ban className="h-3.5 w-3.5" /> Revoke</button>}
            <button onClick={onDelete} className="vl-btn-ghost text-valence-subtle hover:text-valence-danger"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </div>
    </li>
  )
}

function ShareForm({ files, onSubmit, onCancel, dealName }) {
  const [form, setForm] = useState({
    title: `${dealName || 'Deal'} data room`,
    recipientName: '',
    recipientEmail: '',
    note: '',
    expiresInDays: '14',
    fileIds: files.map(f => f.id) // default: all files
  })

  function toggleFile(id) {
    setForm(s => ({
      ...s,
      fileIds: s.fileIds.includes(id) ? s.fileIds.filter(x => x !== id) : [...s.fileIds, id]
    }))
  }

  async function submit(e) {
    e.preventDefault()
    const days = Number(form.expiresInDays) || 0
    const expiresAt = days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null
    // If all files selected, we pass empty array = "all" in the back end
    const fileIds = form.fileIds.length === files.length ? [] : form.fileIds
    await onSubmit({
      title: form.title.trim() || null,
      recipientName: form.recipientName.trim() || null,
      recipientEmail: form.recipientEmail.trim() || null,
      note: form.note.trim() || null,
      expiresAt,
      fileIds
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="vl-label">Title</label>
        <input className="vl-input" value={form.title} onChange={e => setForm(s => ({...s, title: e.target.value}))} autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="vl-label">Recipient name</label>
          <input className="vl-input" value={form.recipientName} onChange={e => setForm(s => ({...s, recipientName: e.target.value}))} placeholder="e.g. Rohit Bansal" />
        </div>
        <div>
          <label className="vl-label">Recipient email</label>
          <input type="email" className="vl-input" value={form.recipientEmail} onChange={e => setForm(s => ({...s, recipientEmail: e.target.value}))} placeholder="name@firm.com" />
        </div>
      </div>
      <div>
        <label className="vl-label">Welcome note <span className="normal-case tracking-normal text-valence-subtle">(shown on the share page)</span></label>
        <textarea className="vl-input min-h-[72px]" value={form.note} onChange={e => setForm(s => ({...s, note: e.target.value}))} placeholder="Anything the counterparty should know before opening the docs…" />
      </div>
      <div>
        <label className="vl-label">Expires in</label>
        <select className="vl-input" value={form.expiresInDays} onChange={e => setForm(s => ({...s, expiresInDays: e.target.value}))}>
          <option value="7">7 days</option>
          <option value="14">14 days</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
          <option value="0">Never</option>
        </select>
      </div>
      <div>
        <label className="vl-label">Files to expose</label>
        {files.length === 0 ? (
          <p className="rounded-lg border border-valence-border bg-valence-surface px-4 py-3 text-xs text-valence-muted">No files uploaded to this deal yet. The share will show only deal metadata until you upload files.</p>
        ) : (
          <div className="max-h-48 overflow-y-auto rounded-lg border border-valence-border bg-valence-elevated divide-y divide-valence-border">
            {files.map(f => (
              <label key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-valence-surface">
                <input
                  type="checkbox"
                  checked={form.fileIds.includes(f.id)}
                  onChange={() => toggleFile(f.id)}
                  className="accent-valence-blue"
                />
                <span className="flex-1 truncate text-valence-text">{f.name}</span>
                <span className="vl-chip">{f.category || 'Other'}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="vl-btn-secondary">Cancel</button>
        <button type="submit" className="vl-btn-primary">Create link</button>
      </div>
    </form>
  )
}
