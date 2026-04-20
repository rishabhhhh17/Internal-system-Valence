import { Link } from 'react-router-dom'
import Logo from './Logo.jsx'

// Dark navy closing panel — mirrors the site's footer treatment.
// Internal-only, no links to the external marketing site.
export default function Footer() {
  return (
    <footer className="relative mt-16 overflow-hidden border-t border-valence-border bg-valence-ink text-white">
      <div className="absolute -left-40 top-0 h-[420px] w-[420px] rounded-full bg-valence-blue/20 blur-[80px]" aria-hidden />
      <div className="absolute -right-32 bottom-0 h-[360px] w-[360px] rounded-full bg-valence-blue/10 blur-[80px]" aria-hidden />

      <div className="relative mx-auto max-w-[1280px] px-6 lg:px-12 py-14">
        <div className="grid gap-10 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
          <div>
            <Logo inverted />
            <p className="mt-5 max-w-xs text-[13px] leading-relaxed text-white/60">
              The internal operating system of Valence Growth Partners. A global investment advisory firm based in Mumbai and London.
            </p>
          </div>

          <FooterCol title="Workspace" items={[
            { label: 'Overview',  to: '/' },
            { label: 'Deals',     to: '/deals' },
            { label: 'Knowledge', to: '/knowledge' },
            { label: 'Day Planner', to: '/planner' }
          ]} />

          <FooterCol title="Team" items={[
            { label: 'Directory', to: '/team' },
            { label: 'Private',   to: '/knowledge/private' }
          ]} />

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">Offices</p>
            <ul className="mt-4 space-y-3 text-[13px] text-white/75">
              <li>
                <span className="block text-white font-semibold">Mumbai</span>
                <span className="block text-white/50 text-xs mt-0.5">India</span>
              </li>
              <li>
                <span className="block text-white font-semibold">London</span>
                <span className="block text-white/50 text-xs mt-0.5">United Kingdom</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6 text-[11px] text-white/50">
          <p>Confidential · Internal use only · {new Date().getFullYear()} Valence Growth Partners</p>
          <p className="inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-valence-blue shadow-[0_0_8px_#3399FF]" />
            Powered by ValenceOS
          </p>
        </div>
      </div>
    </footer>
  )
}

function FooterCol({ title, items }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">{title}</p>
      <ul className="mt-4 space-y-2.5 text-[13px]">
        {items.map(x => (
          <li key={x.label}>
            <Link to={x.to} className="text-white/75 transition hover:text-white">
              {x.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
