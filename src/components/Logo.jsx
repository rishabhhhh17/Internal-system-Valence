export default function Logo({ compact = false, className = '' }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 48 48" className="h-7 w-7 shrink-0" aria-hidden>
        <defs>
          <linearGradient id="vlg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3399FF" />
            <stop offset="100%" stopColor="#1a85ff" />
          </linearGradient>
        </defs>
        <circle cx="18" cy="24" r="10" fill="url(#vlg)" />
        <circle cx="30" cy="24" r="10" fill="#3399FF" fillOpacity="0.45" />
      </svg>
      {!compact && (
        <div className="flex flex-col leading-none">
          <span className="text-[15px] font-semibold tracking-tight text-white">
            Valance<span className="text-valence-blue">OS</span>
          </span>
          <span className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-valence-muted">
            Growth Partners
          </span>
        </div>
      )}
    </div>
  )
}
