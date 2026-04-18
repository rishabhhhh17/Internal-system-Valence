import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Download, FileText, AlertTriangle, Lock, CheckCircle2, Loader2 } from 'lucide-react'
import { loadShareByCode, logAccess } from '../lib/shares.js'
import { publicUrlFor, formatBytes } from '../lib/storage.js'
import Logo from '../components/Logo.jsx'

// Public page rendered at /share/:code — no sidebar, no Valence chrome.
// Accessible to anyone with the link; access is logged server-side.
export default function Share() {
  const { code } = useParams()
  const [state, setState] = useState({ loading: true })

  useEffect(() => {
    (async () => {
      try {
        const share = await loadShareByCode(code)
        if (!share) return setState({ loading: false, notFound: true })
        setState({ loading: false, share })
        if (!share._revoked && !share._expired) {
          logAccess({ shareId: share.id, event: 'view' })
        }
      } catch (e) {
        setState({ loading: false, error: e.message || 'Could not load share.' })
      }
    })()
  }, [code])

  if (state.loading) {
    return (
      <Shell>
        <div className="flex items-center justify-center py-32"><Loader2 className="h-5 w-5 animate-spin text-valence-blue" /></div>
      </Shell>
    )
  }

  if (state.notFound) {
    return (
      <Shell>
        <Centered icon={AlertTriangle} title="Link not found" body="This share link isn't valid. Ask whoever sent it for a new one." />
      </Shell>
    )
  }

  const share = state.share

  if (share._revoked) {
    return (
      <Shell>
        <Centered icon={Lock} title="Access revoked" body="The sender has revoked this link. Please reach out directly for continued access." />
      </Shell>
    )
  }

  if (share._expired) {
    return (
      <Shell>
        <Centered icon={Lock} title="Link expired" body={`This link expired on ${format(new Date(share.expires_at), 'd MMM yyyy')}. Ask the sender for a fresh link if you still need access.`} />
      </Shell>
    )
  }

  const deal = share.deal
  const files = share.files || []

  return (
    <Shell>
      <div className="mx-auto w-full max-w-3xl space-y-8 py-10 px-5">
        <section className="rounded-2xl border border-valence-border bg-white vl-circles px-8 py-10 relative overflow-hidden">
          <div className="relative">
            <p className="vl-eyebrow">Shared data room</p>
            <h1 className="mt-4 font-display text-3xl font-semibold text-valence-text lg:text-4xl">
              {share.title || (deal?.client_name ? `${deal.client_name} — data room` : 'Data room')}
            </h1>
            {deal && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                {deal.deal_type && <span className="vl-chip">{deal.deal_type}</span>}
                {deal.sector && <span className="vl-chip-blue">{deal.sector}</span>}
                {deal.side && <span className="vl-chip">{deal.side}</span>}
              </div>
            )}
            {share.recipient_name && (
              <p className="mt-4 text-sm text-valence-muted">
                Prepared for <b className="text-valence-text">{share.recipient_name}</b>{share.recipient_email ? ` (${share.recipient_email})` : ''}.
              </p>
            )}
            {share.note && (
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-valence-text whitespace-pre-wrap">{share.note}</p>
            )}
            {share.expires_at && (
              <p className="mt-4 text-[11px] text-valence-muted">Access expires {format(new Date(share.expires_at), "EEEE, d MMMM yyyy")}.</p>
            )}
          </div>
        </section>

        {deal?.notes && (
          <section className="vl-card p-6">
            <p className="vl-eyebrow">Situation</p>
            <p className="mt-2 text-sm leading-relaxed text-valence-text">{deal.notes}</p>
          </section>
        )}

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold text-valence-text">Files</h2>
            <span className="text-[11px] text-valence-muted">{files.length} document{files.length === 1 ? '' : 's'}</span>
          </div>
          {files.length === 0 ? (
            <div className="rounded-xl border border-dashed border-valence-border bg-valence-surface px-5 py-8 text-center">
              <FileText className="mx-auto h-4 w-4 text-valence-subtle" />
              <p className="mt-2 text-sm text-valence-muted">No files shared yet. The sender will add documents shortly.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {files.map(f => (
                <li key={f.id}>
                  <a
                    href={publicUrlFor(f.path)}
                    target="_blank" rel="noreferrer"
                    onClick={() => logAccess({ shareId: share.id, event: 'download', fileId: f.id })}
                    className="group flex items-center gap-3 rounded-lg border border-valence-border bg-white px-4 py-3 transition hover:border-valence-ink/20 hover:shadow-valence"
                  >
                    <div className="grid h-10 w-10 place-items-center rounded-lg bg-valence-blue-soft ring-1 ring-valence-blue/20 shrink-0">
                      <FileText className="h-4 w-4 text-valence-blue" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-semibold text-valence-text">{f.name}</p>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-valence-muted">
                        <span className="inline-flex items-center rounded-md border border-valence-border bg-valence-surface px-1.5 py-0.5 font-semibold text-valence-blue">{f.category || 'Other'}</span>
                        <span>{formatBytes(f.size_bytes)}</span>
                      </div>
                    </div>
                    <Download className="h-4 w-4 text-valence-subtle transition group-hover:text-valence-blue" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-valence-border bg-valence-surface px-5 py-4">
          <p className="text-[11px] text-valence-muted inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3 text-valence-success" /> Access to this page is logged for audit.
          </p>
        </section>
      </div>
    </Shell>
  )
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-valence-bg text-valence-text">
      <header className="border-b border-valence-border bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-5">
          <Logo />
          <span className="ml-auto text-[11px] text-valence-muted">Delivered via ValanceOS</span>
        </div>
      </header>
      {children}
      <footer className="border-t border-valence-border bg-white">
        <div className="mx-auto max-w-3xl px-5 py-8 text-[11px] text-valence-muted">
          Confidential · for the intended recipient only. Forwarding or downloading is audited.
        </div>
      </footer>
    </div>
  )
}

function Centered({ icon: Icon, title, body }) {
  return (
    <div className="mx-auto max-w-lg py-24 px-5 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-valence-surface ring-1 ring-valence-border">
        <Icon className="h-5 w-5 text-valence-muted" />
      </div>
      <h1 className="mt-5 font-display text-2xl font-semibold text-valence-text">{title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-valence-muted">{body}</p>
    </div>
  )
}
