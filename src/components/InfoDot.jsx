import { Info } from 'lucide-react'

// Tiny inline "(i)" with a CSS hover tooltip. Used on Analytics metric labels
// so an analyst can confirm the exact definition without leaving the page.
export default function InfoDot({ text, align = 'bottom' }) {
  const pos = {
    bottom: 'top-full mt-1.5 left-1/2 -translate-x-1/2',
    top:    'bottom-full mb-1.5 left-1/2 -translate-x-1/2',
    right:  'left-full ml-2 top-1/2 -translate-y-1/2'
  }[align]
  return (
    <span className="relative inline-flex group align-middle">
      <Info className="h-3 w-3 text-valence-subtle group-hover:text-valence-blue transition cursor-help" />
      <span className={`absolute z-50 ${pos} hidden group-hover:block pointer-events-none`}>
        <span className="block w-48 rounded-lg border border-valence-border-strong bg-valence-ink text-white text-[11px] leading-snug p-2.5 shadow-valence-lg">
          {text}
        </span>
      </span>
    </span>
  )
}
