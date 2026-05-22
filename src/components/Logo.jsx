import { useWorkspaceSetting } from '../hooks/useWorkspaceSetting.js'
import { WORKSPACE_KEYS, WORKSPACE_DEFAULTS } from '../lib/workspace.js'
import { useSeat } from '../hooks/useSeat.js'

export default function Logo({ compact = false, inverted = false, className = '' }) {
  const rawFirmName = useWorkspaceSetting(WORKSPACE_KEYS.firmName)
  const rawKicker   = useWorkspaceSetting(WORKSPACE_KEYS.firmKicker)
  const { org } = useSeat()

  // Prefer the tenant's own org.name from Supabase over the localStorage
  // workspace setting whenever the setting is unset or still on the
  // canonical defaults ("Valence" / "Growth Partners"). This means a
  // brand-new firm that just ran Start-a-team sees their own typed firm
  // name in the topbar from the first render — not the product's stock
  // brand. Partners who explicitly override the firm name in Settings
  // still get whatever they typed (the override only kicks in when the
  // user has set something different from the default).
  const usingDefault = !rawFirmName || rawFirmName === WORKSPACE_DEFAULTS.firmName
  const firmName  = (usingDefault && org?.name) ? org.name : (rawFirmName || WORKSPACE_DEFAULTS.firmName)
  const firmKicker = (usingDefault && org?.name) ? '' : rawKicker
  const titleClass = inverted ? 'text-white' : 'text-valence-text'
  const kickerClass = inverted ? 'text-white/60' : 'text-valence-muted'

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <svg viewBox="0 0 48 48" className="h-8 w-8 shrink-0" aria-hidden>
        <circle cx="18" cy="24" r="10" fill="#3399FF" />
        <circle cx="30" cy="24" r="10" fill="#3399FF" fillOpacity="0.55" />
      </svg>
      {!compact && (
        <div className="flex flex-col leading-none">
          <span className={`text-[15px] font-semibold tracking-tight ${titleClass}`}>
            {firmName}{usingDefault && !org?.name ? <span className="text-valence-blue">OS</span> : null}
          </span>
          {firmKicker && (
            <span className={`mt-1 text-[10px] uppercase tracking-[0.2em] ${kickerClass}`}>
              {firmKicker}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
