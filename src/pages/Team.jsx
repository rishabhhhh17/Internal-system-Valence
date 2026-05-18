import { useMemo, useState } from 'react'
import { Search, MapPin, Mail, ArrowUpRight } from 'lucide-react'

const TEAM = [
  { name: 'Neha Jain',     title: 'Managing Director', city: 'Mumbai', expertise: ['Healthcare','Infrastructure','M&A'] },
  { name: 'Rishi Kapoor',  title: 'Managing Director', city: 'London', expertise: ['BFSI','Healthcare','DCM'] },
  { name: 'Vikram Patel',  title: 'Director',          city: 'Mumbai', expertise: ['Consumer Tech','PE/VC','M&A'] },
  { name: 'Arjun Mehta',   title: 'Vice President',    city: 'London', expertise: ['EdTech','BFSI','ECM'] },
  { name: 'Rohan Gupta',   title: 'Vice President',    city: 'Mumbai', expertise: ['Infrastructure','Fintech','M&A'] },
  { name: 'Priya Sharma',  title: 'Associate',         city: 'Mumbai', expertise: ['Fintech','ECM','M&A'] },
  { name: 'Ananya Roy',    title: 'Associate',         city: 'London', expertise: ['EdTech','Consumer Tech','PE/VC'] },
  { name: 'Karan Singh',   title: 'Analyst',           city: 'Mumbai', expertise: ['Energy','Consumer Tech','DCM'] }
]

const ROLE_ORDER = ['Managing Director','Director','Vice President','Associate','Analyst']

function initials(name) {
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
}

function emailFor(name) {
  const parts = name.toLowerCase().split(' ')
  return `${parts[0]}.${parts[parts.length - 1]}@valencegrowth.com`
}

export default function Team() {
  const [q, setQ] = useState('')
  const [role, setRole] = useState('All')
  const [expertise, setExpertise] = useState('All')

  const expertiseOptions = useMemo(
    () => Array.from(new Set(TEAM.flatMap(m => m.expertise))).sort(),
    []
  )

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = TEAM.filter(m =>
      (role === 'All' || m.title === role) &&
      (expertise === 'All' || m.expertise.includes(expertise)) &&
      (!needle ||
        m.name.toLowerCase().includes(needle) ||
        m.title.toLowerCase().includes(needle) ||
        m.expertise.some(e => e.toLowerCase().includes(needle)))
    )
    return list.sort((a, b) => ROLE_ORDER.indexOf(a.title) - ROLE_ORDER.indexOf(b.title))
  }, [q, role, expertise])

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-valence-border bg-valence-elevated vl-circles py-16 px-8 lg:py-24 lg:px-14">
        <div className="absolute inset-0 bg-valence-grid opacity-50" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-10 z-10">
          <div className="max-w-2xl">
            <p className="vl-eyebrow">The Valence team</p>
            <h1 className="mt-5 font-display text-display font-bold text-valence-text">
              Senior coverage, across Mumbai and London.
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-valence-muted lg:text-base">
              One floor across two cities. Find the right person for any mandate — filtered by sector, role, or experience.
            </p>
          </div>
          <div className="flex gap-10">
            <Metric label="Team" value={TEAM.length} />
            <Metric label="Cities" value={2} />
            <Metric label="Sectors" value={expertiseOptions.length} />
          </div>
        </div>
      </section>

      {/* Filters */}
      <div className="vl-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-1 min-w-[240px] items-center gap-2 rounded-lg border border-valence-border bg-valence-surface px-3 py-2">
            <Search className="h-3.5 w-3.5 text-valence-subtle" />
            <input
              value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search by name, title or expertise…"
              className="flex-1 bg-transparent text-sm text-valence-text placeholder:text-valence-subtle outline-none"
            />
          </div>

          <Select value={role} onChange={setRole} label="Role" options={['All', ...ROLE_ORDER]} />
          <Select value={expertise} onChange={setExpertise} label="Sector" options={['All', ...expertiseOptions]} />
        </div>
      </div>

      {/* Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map(m => <PersonCard key={m.name} person={m} />)}
      </div>

      {filtered.length === 0 && (
        <div className="vl-card py-12 text-center">
          <p className="text-sm text-valence-muted">No one matches those filters.</p>
        </div>
      )}
    </div>
  )
}

function PersonCard({ person }) {
  const email = emailFor(person.name)
  const roleTone = {
    'Managing Director': 'text-valence-blue',
    'Director':          'text-valence-blue',
    'Vice President':    'text-valence-text',
    'Associate':         'text-valence-muted',
    'Analyst':           'text-valence-muted'
  }[person.title]

  return (
    <article className="vl-card vl-card-hover group relative overflow-hidden p-5">
      <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-valence-blue/10 to-transparent" aria-hidden />
      <div className="relative flex items-start gap-4">
        <Avatar name={person.name} />
        <div className="flex-1 min-w-0">
          <p className="truncate text-[15px] font-semibold text-valence-text">{person.name}</p>
          <p className={`mt-0.5 text-xs font-semibold ${roleTone}`}>{person.title}</p>
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-valence-muted">
            <MapPin className="h-3 w-3" /> {person.city}
          </p>
        </div>
      </div>

      <div className="relative mt-5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-valence-subtle">Expertise</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {person.expertise.map(e => (
            <span key={e} className="vl-chip">{e}</span>
          ))}
        </div>
      </div>

      <div className="relative mt-5 flex items-center justify-between border-t border-valence-border pt-4">
        <a href={`mailto:${email}`} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-valence-muted hover:text-valence-blue truncate">
          <Mail className="h-3 w-3" /> {email}
        </a>
        <ArrowUpRight className="h-4 w-4 text-valence-subtle opacity-0 transition group-hover:opacity-100 group-hover:text-valence-blue" />
      </div>
    </article>
  )
}

function Avatar({ name }) {
  // Deterministic blue-family gradient per person
  const seed = name.charCodeAt(0) + name.charCodeAt(name.length - 1)
  const hue = 210 + (seed % 20)
  const style = {
    background: `linear-gradient(135deg, hsl(${hue} 100% 60%) 0%, hsl(${hue} 90% 45%) 100%)`
  }
  return (
    <div
      className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-sm font-semibold text-white ring-1 ring-valence-border-strong shadow-valence"
      style={style}
    >
      {initials(name)}
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div>
      <p className="vl-eyebrow-ink">{label}</p>
      <p className="mt-2 font-display text-4xl font-bold tabular-nums text-valence-text tracking-[-0.04em]">{value}</p>
    </div>
  )
}

function Select({ value, onChange, label, options }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-valence-border bg-valence-surface pl-3 pr-2 py-2 text-xs font-medium text-valence-muted">
      <span className="text-[11px] uppercase tracking-wider">{label}</span>
      <select
        value={value} onChange={e => onChange(e.target.value)}
        className="bg-transparent pr-1 text-sm font-semibold text-valence-text outline-none"
      >
        {options.map(o => <option key={o} className="bg-valence-surface" value={o}>{o}</option>)}
      </select>
    </label>
  )
}
