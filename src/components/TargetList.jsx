import { useState } from 'react'
import { Sparkles, Loader2, RefreshCw, Download, Building2, Users as UsersIcon, Mail, Copy, Check } from 'lucide-react'
import { suggestTargets } from '../lib/targets.js'
import { isGeminiConfigured } from '../lib/gemini.js'
import { logActivity } from '../lib/activity.js'
import { useToast } from './Toast.jsx'

export default function TargetList({ deal }) {
  const toast = useToast()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function run() {
    if (!isGeminiConfigured) { setError('Add VITE_GEMINI_API_KEY to generate target lists.'); return }
    setLoading(true); setError(''); setList([])
    try {
      const targets = await suggestTargets(deal)
      setList(targets)
      if (deal?.id) await logActivity({ dealId: deal.id, kind: 'note', body: `Target list generated (${targets.length} candidates).` })
    } catch (e) {
      setError(e.message || 'Could not generate target list.')
    } finally {
      setLoading(false)
    }
  }

  function toCSV() {
    if (!list.length) return
    const header = ['Name','Kind','Geography','Warmth','Internal contact','Rationale']
    const rows = list.map(t => [
      t.name || '', t.kind || '', t.geography || '', t.warmth || '',
      t.internal_contact || '', (t.rationale || '').replace(/\s+/g, ' ')
    ])
    const csv = [header, ...rows].map(r =>
      r.map(f => `"${String(f).replace(/"/g, '""')}"`).join(',')
    ).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(deal?.client_name || 'deal').replace(/\s+/g, '_')}_targets.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function copyAll() {
    if (!list.length) return
    const text = list.map((t, i) =>
      `${i + 1}. ${t.name} (${t.kind}${t.geography ? ', ' + t.geography : ''}) — ${t.warmth}\n   ${t.rationale}${t.internal_contact ? `\n   Internal: ${t.internal_contact}` : ''}`
    ).join('\n\n')
    await navigator.clipboard.writeText(text)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-valence-border bg-gradient-to-br from-valence-blue-soft via-white to-white p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-valence-blue-soft ring-1 ring-valence-blue/30 shrink-0">
            <UsersIcon className="h-4 w-4 text-valence-blue" />
          </div>
          <div className="flex-1">
            <p className="font-display text-lg font-semibold text-valence-text">Suggested outreach list</p>
            <p className="mt-1 text-xs text-valence-muted leading-relaxed">
              Shortlist of buyers / investors to approach, ranked by fit. Draws on sector memos, your firm's contacts, and market knowledge.
            </p>
          </div>
          <button onClick={run} disabled={loading} className="vl-btn-accent shrink-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? 'Working…' : (list.length ? 'Regenerate' : 'Generate list')}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-valence-danger">{error}</p>}

      {loading && list.length === 0 && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 rounded-xl bg-valence-surface animate-pulse" />)}
        </div>
      )}

      {list.length > 0 && (
        <>
          <div className="flex items-center justify-end gap-2">
            <button onClick={copyAll} className="vl-btn-ghost">
              {copied ? <><Check className="h-3.5 w-3.5 text-valence-success" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
            </button>
            <button onClick={toCSV} className="vl-btn-secondary">
              <Download className="h-4 w-4" /> Export CSV
            </button>
          </div>

          <ol className="space-y-2">
            {list.map((t, i) => (
              <li key={i} className="vl-card p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-valence-ink text-[11px] font-semibold text-white shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-valence-text">{t.name}</p>
                      {t.kind && <span className="vl-chip">{t.kind}</span>}
                      {t.geography && <span className="vl-chip">{t.geography}</span>}
                      {t.warmth === 'Internal relationship'
                        ? <span className="vl-chip-blue">Internal relationship</span>
                        : <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                            t.warmth === 'Warm' ? 'border-valence-success/30 bg-valence-success-soft text-valence-success' : 'border-valence-border bg-valence-elevated text-valence-muted'
                          }`}>{t.warmth || 'Cold'}</span>}
                    </div>
                    <p className="mt-2 text-[13px] leading-relaxed text-valence-text">{t.rationale}</p>
                    {t.internal_contact && (
                      <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-valence-blue">
                        <Building2 className="h-3 w-3" /> Internal: {t.internal_contact}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}
