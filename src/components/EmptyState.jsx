import { Sparkles } from 'lucide-react'

export default function EmptyState({ title, description, icon: Icon = Sparkles, action }) {
  return (
    <div className="vl-card flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-valence-blue-soft ring-1 ring-valence-blue/30">
        <Icon className="h-5 w-5 text-valence-blue" />
      </div>
      <h3 className="text-base font-semibold text-valence-text">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-valence-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
