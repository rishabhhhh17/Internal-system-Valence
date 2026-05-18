import { useState } from 'react'
import { Building2, Gauge, DollarSign, Check } from 'lucide-react'
import {
  WORKSPACE_KEYS,
  WORKSPACE_DEFAULTS,
  getWorkspaceSetting,
  setWorkspaceSetting
} from '../lib/workspace.js'
import { useWorkspaceSetting } from '../hooks/useWorkspaceSetting.js'
import { useCurrency } from '../hooks/useCurrency.jsx'
import { CURRENCIES } from '../lib/currency.js'
import { useToast } from './Toast.jsx'

function Field({ label, hint, children }) {
  return (
    <div className="space-y-1.5">
      <label className="vl-label">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-valence-subtle">{hint}</p>}
    </div>
  )
}

export default function WorkspacePreferencesPanel() {
  const toast = useToast()
  const firmName = useWorkspaceSetting(WORKSPACE_KEYS.firmName)
  const firmKicker = useWorkspaceSetting(WORKSPACE_KEYS.firmKicker)
  const browserTitle = useWorkspaceSetting(WORKSPACE_KEYS.browserTitle)
  const { currency, setCurrency } = useCurrency()

  const [savedFlash, setSavedFlash] = useState('')

  function flash(label) {
    setSavedFlash(label)
    setTimeout(() => setSavedFlash(prev => (prev === label ? '' : prev)), 1200)
  }

  function update(key, value) {
    const ok = setWorkspaceSetting(key, value)
    if (!ok) {
      toast.error('Could not save — browser storage blocked.')
      return false
    }
    return true
  }

  return (
    <div className="vl-card p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-valence-blue-soft p-2 text-valence-blue">
          <Building2 className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-valence-text">Firm preferences</h3>
          <p className="text-xs text-valence-muted mt-0.5">
            Override the firm name shown across the app, default currency, and how dense the cards feel. Saved locally in this browser.
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Firm name (wordmark)" hint="Shown in the topbar and sidebar.">
          <input
            className="vl-input"
            value={firmName}
            placeholder={WORKSPACE_DEFAULTS.firmName}
            onChange={e => {
              if (update(WORKSPACE_KEYS.firmName, e.target.value)) flash('firm')
            }}
          />
        </Field>
        <Field label="Firm kicker" hint="Small caps line under the wordmark.">
          <input
            className="vl-input"
            value={firmKicker}
            placeholder={WORKSPACE_DEFAULTS.firmKicker}
            onChange={e => {
              if (update(WORKSPACE_KEYS.firmKicker, e.target.value)) flash('kicker')
            }}
          />
        </Field>
        <Field label="Browser tab title" hint="Empty = use the firm name + 'OS'.">
          <input
            className="vl-input"
            value={browserTitle}
            placeholder="e.g. Acme Dashboard"
            onChange={e => {
              if (update(WORKSPACE_KEYS.browserTitle, e.target.value)) flash('title')
            }}
          />
        </Field>
        <Field label="Default currency" hint="Toggle still cycles via the topbar pill.">
          <select
            className="vl-input"
            value={currency}
            onChange={e => { setCurrency(e.target.value); flash('currency') }}
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>

      {savedFlash && (
        <p className="text-[11px] inline-flex items-center gap-1 text-valence-blue">
          <Check className="h-3 w-3" /> Saved
        </p>
      )}
    </div>
  )
}
