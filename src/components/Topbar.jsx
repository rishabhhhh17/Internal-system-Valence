import { useLocation } from 'react-router-dom'
import { Search } from 'lucide-react'
import Logo from './Logo.jsx'
import GoogleButton from './GoogleButton.jsx'

const titles = {
  '/':          { title: 'Overview',        sub: 'The firm at a glance — pipeline, activity, the day ahead.' },
  '/deals':     { title: 'Deal Logger',     sub: 'Every live mandate, tracked with institutional rigour.' },
  '/knowledge': { title: 'Knowledge',       sub: 'The shared mind of the firm — searchable, citable, instant.' },
  '/planner':   { title: 'Day Planner',     sub: 'Walk into your day prepared. Propose times in a tap.' },
  '/drive':     { title: 'Drive',           sub: 'Your Google Drive, surfaced here.' },
  '/team':      { title: 'Team',            sub: 'Coverage across sectors and geographies.' }
}

export default function Topbar() {
  const { pathname } = useLocation()
  const meta = titles[pathname] || { title: 'ValanceOS', sub: '' }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-valence-border bg-white/80 px-5 backdrop-blur lg:px-8">
      <div className="flex items-center gap-3 lg:hidden">
        <Logo compact />
      </div>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[15px] font-semibold tracking-tight text-valence-text">
          {meta.title}
        </h1>
        <p className="hidden truncate text-xs text-valence-muted sm:block">{meta.sub}</p>
      </div>

      <button
        onClick={() => {
          const ev = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })
          window.dispatchEvent(ev)
        }}
        className="hidden md:flex items-center gap-2 rounded-lg border border-valence-border bg-white px-3 py-1.5 text-sm text-valence-muted w-72 hover:border-valence-ink/30 transition text-left"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-valence-subtle">Search deals, memos, people…</span>
        <span className="vl-kbd">⌘K</span>
      </button>

      <GoogleButton />
    </header>
  )
}
