import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck, Lock, Database, Cpu, KeyRound, FileText, Users, ArrowRight } from 'lucide-react'
import { getWorkspaceSetting, setWorkspaceSetting, WORKSPACE_KEYS } from '../lib/workspace.js'

// Security & AI — the trust surface. Every claim here is something the
// architecture actually does (or an honestly-tagged roadmap item). This is
// what a security-conscious GP reads before they'll put founder/LP data in.
const POSTURE = [
  {
    icon: Database,
    title: 'Your firm is ring-fenced',
    body: 'Every record is isolated per firm at the database layer (row-level security). One firm physically cannot read another’s deals, LPs, or contacts — enforced on every query, not in app code.',
    tag: 'Active'
  },
  {
    icon: Lock,
    title: 'Encrypted in transit and at rest',
    body: 'All traffic is TLS-encrypted; data is encrypted at rest (AES-256) on managed, access-controlled infrastructure. Backups are encrypted too.',
    tag: 'Active'
  },
  {
    icon: Cpu,
    title: 'Your data never trains an AI model',
    body: 'The AI layer runs on zero-retention API tiers — your data is not stored by the model provider and is never used for training. The model only ever sees the minimum needed (extracted facts, not raw documents).',
    tag: 'Active'
  },
  {
    icon: KeyRound,
    title: 'Bring your own model',
    body: 'Plug in your firm’s own Anthropic / OpenAI / Google key and inference runs entirely under your contract — we never see it. Or run a private/open-weights model. The platform is provider-agnostic.',
    tag: 'Active',
    to: '/settings?section=integrations',
    cta: 'Configure model'
  },
  {
    id: 'docs',
    icon: FileText,
    title: 'Reference documents — don’t upload them',
    body: 'Sensitive files (NDAs, LP agreements) stay in your own Drive / data room. In reference-only mode the platform links to them and tracks status — the file itself is never copied in.',
    tag: 'Active'
  },
  {
    icon: Users,
    title: 'Access control & audit',
    body: 'Single sign-on via Google Workspace, per-seat access scoped to your firm, and a full audit trail of who saw and changed what. Single-tenant / bring-your-own-database deployment available for funds that require total isolation.',
    tag: 'SSO active · audit + single-tenant on roadmap'
  }
]

export default function SecurityPanel() {
  const [docMode, setDocMode] = useState(getWorkspaceSetting(WORKSPACE_KEYS.documentHandling, 'reference'))
  function chooseDocMode(mode) {
    setWorkspaceSetting(WORKSPACE_KEYS.documentHandling, mode)
    setDocMode(mode)
  }
  return (
    <div className="space-y-4">
      <div className="vl-card p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-valence-blue-soft text-valence-blue"><ShieldCheck className="h-5 w-5" /></span>
          <div>
            <h2 className="text-[15px] font-semibold text-valence-text">Security &amp; data control</h2>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-valence-muted">
              Founder and LP data is the most sensitive thing your firm holds. Here is exactly how it is isolated, encrypted, and kept out of any AI model’s reach.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {POSTURE.map(p => (
          <div key={p.title} className="vl-card p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-valence-surface text-valence-muted"><p.icon className="h-4 w-4" /></span>
              <span className="rounded-full border border-valence-border bg-valence-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-valence-muted">{p.tag}</span>
            </div>
            <h3 className="mt-3 text-[13px] font-semibold text-valence-text">{p.title}</h3>
            <p className="mt-1.5 text-[12px] leading-relaxed text-valence-muted">{p.body}</p>
            {p.id === 'docs' && (
              <div className="mt-3 inline-flex items-center rounded-lg border border-valence-border bg-valence-surface p-0.5">
                {[['reference', 'Reference-only'], ['upload', 'Allow uploads']].map(([m, label]) => (
                  <button
                    key={m}
                    onClick={() => chooseDocMode(m)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${docMode === m ? 'bg-valence-ink text-white' : 'text-valence-muted hover:text-valence-text'}`}
                  >{label}</button>
                ))}
              </div>
            )}
            {p.to && (
              <Link to={p.to} className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-valence-blue hover:text-valence-blue-hover">
                {p.cta} <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        ))}
      </div>

      <p className="px-1 text-[11px] leading-relaxed text-valence-subtle">
        Items marked &ldquo;Active&rdquo; are enforced today. &ldquo;Rolling out&rdquo; / &ldquo;roadmap&rdquo; items are in progress — ask us for the current status or a security review.
      </p>
    </div>
  )
}
