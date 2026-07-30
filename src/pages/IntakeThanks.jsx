import { Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import Logo from '../components/Logo.jsx'

export default function IntakeThanks() {
  return (
    <div className="min-h-screen bg-valence-ink text-white">
      <header className="border-b border-white/10 bg-valence-ink">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <Logo />
          <a href="https://valencegrowth.com" className="text-[11px] text-white/60 hover:text-white">valencegrowth.com</a>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-24 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-valence-success/15 ring-1 ring-valence-success/30">
          <CheckCircle2 className="h-5 w-5 text-valence-success" />
        </div>
        <h1 className="mt-6 font-display text-4xl font-bold tracking-tight md:text-5xl">
          Thank you. We'll be in touch.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-white/70">
          A partner reviews every submission within 48 hours. You'll get either a calendar invite or a clear, useful pass — never silence.
        </p>
        <div className="mt-10 flex items-center justify-center gap-3">
          <Link to="/intake" className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10">Submit another mandate</Link>
          <a href="https://valencegrowth.com" className="inline-flex items-center gap-2 rounded-lg bg-valence-blue px-3 py-2 text-xs font-semibold text-white hover:brightness-110">Back to valencegrowth.com</a>
        </div>
      </main>
    </div>
  )
}
