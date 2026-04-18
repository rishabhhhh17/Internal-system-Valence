import { AlertTriangle } from 'lucide-react'
import { isSupabaseConfigured } from '../lib/supabase.js'

export default function ConfigBanner() {
  if (isSupabaseConfigured) return null
  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-valence-warning/30 bg-valence-warning/5 px-4 py-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-valence-warning" />
      <div className="text-sm">
        <p className="font-semibold text-valence-text">Supabase not configured</p>
        <p className="mt-0.5 text-valence-muted">
          Add <span className="vl-kbd">VITE_SUPABASE_URL</span> and <span className="vl-kbd">VITE_SUPABASE_ANON_KEY</span> to a <span className="vl-kbd">.env</span> file, then run the SQL in <span className="vl-kbd">supabase/schema.sql</span>. ValanceOS is showing demo data meanwhile.
        </p>
      </div>
    </div>
  )
}
