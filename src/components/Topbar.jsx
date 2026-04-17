import { useLocation } from 'react-router-dom'
import { Search, Bell } from 'lucide-react'
import Logo from './Logo.jsx'
import GoogleButton from './GoogleButton.jsx'

const titles = {
  '/':          { title: 'Overview',        sub: 'Snapshot of live deals, knowledge and the day ahead.' },
  '/deals':     { title: 'Deal Logger',     sub: 'Every live mandate — tracked, filtered, and searchable.' },
  '/knowledge': { title: 'Knowledge Base',  sub: 'Shared institutional memory. Search across notes, memos and templates.' },
  '/planner':   { title: 'Day Planner',     sub: 'Meetings, tasks and a scheduling assistant for outbound coordination.' },
  '/drive':     { title: 'Drive',           sub: 'Your Google Drive, inside ValanceOS.' },
  '/team':      { title: 'Team Directory',  sub: 'Valence core team — sectors and coverage at a glance.' }
}

export default function Topbar() {
  const { pathname } = useLocation()
  const meta = titles[pathname] || { title: 'ValanceOS', sub: '' }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-valence-border bg-valence-bg/80 px-5 backdrop-blur-md lg:px-8">
      <div className="flex items-center gap-3 lg:hidden">
        <Logo compact />
      </div>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[15px] font-semibold tracking-tight text-white">
          {meta.title}
        </h1>
        <p className="hidden truncate text-xs text-valence-muted sm:block">{meta.sub}</p>
      </div>

      <button
        onClick={() => {
          const ev = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })
          window.dispatchEvent(ev)
        }}
        className="hidden md:flex items-center gap-2 rounded-lg border border-valence-border bg-white/[0.03] px-3 py-1.5 text-sm text-valence-muted w-72 hover:border-valence-border-strong transition text-left"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-valence-subtle">Search deals, docs, contacts…</span>
        <span className="vl-kbd">⌘K</span>
      </button>

      <GoogleButton />
    </header>
  )
}
