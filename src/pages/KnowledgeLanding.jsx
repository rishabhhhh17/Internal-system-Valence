import { Link } from 'react-router-dom'
import { BookOpen, FolderOpen, ArrowUpRight, Sparkles, Lock, FolderTree } from 'lucide-react'
import ConfigBanner from '../components/ConfigBanner.jsx'

export default function KnowledgeLanding() {
  return (
    <div className="space-y-8">
      <ConfigBanner />

      <div>
        <p className="vl-eyebrow-ink">Knowledge</p>
        <h1 className="mt-2 font-display text-feature font-bold text-valence-text">
          What do you want to open?
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-valence-muted">
          Three tracks — folder-structured notes per mandate, firm-shared playbooks and comps, and your own private Drive.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Link to="/knowledge/mandates" className="vl-card vl-card-hover group block p-8 relative overflow-hidden">
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-valence-blue/15 blur-3xl" aria-hidden />
          <div className="relative">
            <div className="flex items-start justify-between">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-valence-blue-soft ring-1 ring-valence-blue/20">
                <FolderTree className="h-5 w-5 text-valence-blue" />
              </div>
              <ArrowUpRight className="h-4 w-4 text-valence-subtle group-hover:text-valence-blue transition" />
            </div>
            <p className="mt-6 vl-eyebrow-ink">Mandate notes</p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-valence-text">
              Per-mandate folders
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-valence-muted">
              Each mandate gets its own folder hierarchy — investor / buyer meetings, diligence, internal notes. Tag people and funds with <span className="vl-kbd">[[</span> to cross-link, scope concepts with <span className="vl-kbd">#tag</span>.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2 text-[11px] text-valence-muted">
              <span className="rounded-full border border-valence-border bg-valence-surface px-2 py-1">Folders</span>
              <span className="rounded-full border border-valence-border bg-valence-surface px-2 py-1">Notes</span>
              <span className="rounded-full border border-valence-border bg-valence-surface px-2 py-1">Smart links</span>
            </div>
          </div>
        </Link>

        <Link to="/knowledge/shared" className="vl-card vl-card-hover group block p-8 relative overflow-hidden">
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-valence-blue/10 blur-3xl" aria-hidden />
          <div className="relative">
            <div className="flex items-start justify-between">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-valence-blue-soft ring-1 ring-valence-blue/20">
                <BookOpen className="h-5 w-5 text-valence-blue" />
              </div>
              <ArrowUpRight className="h-4 w-4 text-valence-subtle group-hover:text-valence-blue transition" />
            </div>
            <p className="mt-6 vl-eyebrow-ink">Firm-shared</p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-valence-text">
              Knowledge
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-valence-muted">
              Memos, files, comps and deal notes the team has shared with the firm. Ask, search, cite.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2 text-[11px] text-valence-muted">
              <span className="inline-flex items-center gap-1 rounded-full border border-valence-border bg-valence-surface px-2 py-1">
                <Sparkles className="h-3 w-3 text-valence-blue" /> Ask
              </span>
              <span className="rounded-full border border-valence-border bg-valence-surface px-2 py-1">Search</span>
              <span className="rounded-full border border-valence-border bg-valence-surface px-2 py-1">Memos</span>
              <span className="rounded-full border border-valence-border bg-valence-surface px-2 py-1">Files</span>
              <span className="rounded-full border border-valence-border bg-valence-surface px-2 py-1">Comps</span>
            </div>
          </div>
        </Link>

        <Link to="/knowledge/private" className="vl-card vl-card-hover group block p-8 relative overflow-hidden">
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-valence-ink/5 blur-3xl" aria-hidden />
          <div className="relative">
            <div className="flex items-start justify-between">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-valence-surface border border-valence-border">
                <FolderOpen className="h-5 w-5 text-valence-text" />
              </div>
              <ArrowUpRight className="h-4 w-4 text-valence-subtle group-hover:text-valence-blue transition" />
            </div>
            <p className="mt-6 vl-eyebrow-ink inline-flex items-center gap-1.5">
              <Lock className="h-3 w-3" /> Private to you
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-valence-text">
              Private
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-valence-muted">
              Your personal Google Drive, searchable from here. Shared with nobody.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2 text-[11px] text-valence-muted">
              <span className="rounded-full border border-valence-border bg-valence-surface px-2 py-1">Docs</span>
              <span className="rounded-full border border-valence-border bg-valence-surface px-2 py-1">Sheets</span>
              <span className="rounded-full border border-valence-border bg-valence-surface px-2 py-1">Slides</span>
              <span className="rounded-full border border-valence-border bg-valence-surface px-2 py-1">PDFs</span>
            </div>
          </div>
        </Link>
      </div>
    </div>
  )
}
