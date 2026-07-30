// ============================================================
// Connectors — clients plug their own MCP servers into ValenceOS.
// Register an endpoint, discover its tools, enable it per workspace.
// ============================================================
import { useEffect, useState, useCallback } from 'react'
import { Plug, Plus, X, Loader2, CheckCircle2, AlertCircle, CircleDashed, Trash2, RefreshCw, Wrench, Play } from 'lucide-react'
import { getMyWorkspaceId, listConnectors, addConnector, updateConnector, removeConnector, testConnector, callTool } from '../lib/connectors.js'
import { isSupabaseConfigured } from '../lib/supabase.js'

export default function Connectors() {
  const [workspaceId, setWorkspaceId] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const ws = await getMyWorkspaceId()
      if (!ws) { setErr('You’re not a member of any workspace yet.'); return }
      setWorkspaceId(ws)
      setRows(await listConnectors(ws))
    } catch (e) { setErr(e.message) } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) { setErr('Supabase isn’t configured.'); setLoading(false); return }
    load()
  }, [load])

  async function handleAdd(form) {
    const row = await addConnector({ workspaceId, ...form })
    setRows(prev => [row, ...prev])
    setAdding(false)
    // fire-and-forget discovery
    testConnector(row).then(saved => setRows(prev => prev.map(r => r.id === saved.id ? saved : r))).catch(() => {})
  }
  async function handleTest(row) {
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, status: 'testing' } : r))
    try {
      const saved = await testConnector(row)
      setRows(prev => prev.map(r => r.id === saved.id ? saved : r))
    } catch (e) {
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, status: 'error', status_detail: e.message } : r))
    }
  }
  async function handleToggle(row) {
    const saved = await updateConnector(row.id, { enabled: !row.enabled })
    setRows(prev => prev.map(r => r.id === saved.id ? saved : r))
  }
  async function handleRemove(row) {
    if (!confirm(`Remove connector “${row.name}”?`)) return
    await removeConnector(row.id)
    setRows(prev => prev.filter(r => r.id !== row.id))
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 animate-fade-in">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-valence-blue-soft text-valence-blue"><Plug className="h-5 w-5" /></div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold tracking-tight text-valence-text">Connectors</h1>
          <p className="mt-0.5 text-sm text-valence-muted">Bring your own <b>MCP servers</b> into ValenceOS — plug in your tools without a formal integration.</p>
        </div>
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-valence-blue px-3 py-2 text-sm font-medium text-white hover:bg-valence-blue-hover transition">
          <Plus className="h-4 w-4" /> Add connector
        </button>
      </div>

      {err && (
        <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-valence-danger/30 bg-valence-danger-soft p-4 text-sm text-valence-danger">
          <span>{err}</span>
          <button onClick={() => { setErr(null); load() }} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-valence-danger/30 px-2.5 py-1 text-xs font-semibold hover:bg-valence-danger/10">
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid place-items-center p-16 text-valence-muted"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <div className="mt-6 space-y-3">
          {rows.length === 0 && !err && (
            <div className="rounded-2xl border border-dashed border-valence-border-strong p-10 text-center">
              <Plug className="mx-auto h-6 w-6 text-valence-subtle" />
              <p className="mt-3 text-sm font-medium text-valence-text">No connectors yet</p>
              <p className="mt-1 text-sm text-valence-muted">Add an MCP endpoint to bring a client’s tools into the workspace.</p>
            </div>
          )}
          {rows.map(row => (
            <ConnectorCard key={row.id} row={row} onTest={handleTest} onToggle={handleToggle} onRemove={handleRemove} />
          ))}
        </div>
      )}

      {adding && <AddDialog onClose={() => setAdding(false)} onAdd={handleAdd} />}
    </div>
  )
}

function StatusPill({ status }) {
  const map = {
    connected: { icon: CheckCircle2, cls: 'text-valence-success bg-valence-success-soft', label: 'Connected' },
    error:     { icon: AlertCircle,  cls: 'text-valence-danger bg-valence-danger-soft',   label: 'Error' },
    testing:   { icon: Loader2,      cls: 'text-valence-blue bg-valence-blue-soft',        label: 'Testing…' },
    unknown:   { icon: CircleDashed, cls: 'text-valence-muted bg-valence-surface',         label: 'Not tested' },
  }
  const { icon: Icon, cls, label } = map[status] || map.unknown
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      <Icon className={`h-3 w-3 ${status === 'testing' ? 'animate-spin' : ''}`} /> {label}
    </span>
  )
}

function ConnectorCard({ row, onTest, onToggle, onRemove }) {
  const [showTools, setShowTools] = useState(false)
  const [runTool, setRunTool] = useState(null)
  const tools = Array.isArray(row.tools) ? row.tools : []
  return (
    <div className="rounded-2xl border border-valence-border bg-valence-surface p-4 shadow-valence">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-valence-text truncate">{row.name}</h3>
            <StatusPill status={row.status} />
            <span className="rounded bg-valence-bg px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-valence-subtle">{row.transport}</span>
          </div>
          <p className="mt-0.5 truncate font-mono text-xs text-valence-muted">{row.url}</p>
          {row.status_detail && <p className="mt-1 text-xs text-valence-subtle">{row.status_detail}</p>}
        </div>

        {/* enable toggle */}
        <button
          onClick={() => onToggle(row)}
          title={row.enabled ? 'Enabled' : 'Disabled'}
          className={`relative h-6 w-10 shrink-0 rounded-full transition ${row.enabled ? 'bg-valence-blue' : 'bg-valence-border-strong'}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${row.enabled ? 'left-[18px]' : 'left-0.5'}`} />
        </button>

        <button onClick={() => onTest(row)} className="grid h-8 w-8 place-items-center rounded-lg text-valence-muted hover:bg-valence-bg hover:text-valence-blue transition" title="Test connection">
          <RefreshCw className={`h-4 w-4 ${row.status === 'testing' ? 'animate-spin' : ''}`} />
        </button>
        <button onClick={() => onRemove(row)} className="grid h-8 w-8 place-items-center rounded-lg text-valence-muted hover:bg-valence-danger/10 hover:text-valence-danger transition" title="Remove">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {tools.length > 0 && (
        <div className="mt-3 border-t border-valence-border pt-3">
          <button onClick={() => setShowTools(v => !v)} className="inline-flex items-center gap-1.5 text-xs font-medium text-valence-muted hover:text-valence-text transition">
            <Wrench className="h-3.5 w-3.5" /> {tools.length} tool{tools.length === 1 ? '' : 's'} {showTools ? '▾' : '▸'}
          </button>
          {showTools && (
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {tools.map((t, i) => (
                <button
                  key={i}
                  onClick={() => setRunTool(t)}
                  className="group flex items-start gap-2 rounded-lg bg-valence-bg px-2.5 py-1.5 text-left hover:bg-valence-blue-soft transition"
                  title={`Run ${t.name}`}
                >
                  <Play className="mt-0.5 h-3 w-3 shrink-0 text-valence-subtle group-hover:text-valence-blue" />
                  <span className="min-w-0">
                    <span className="block font-mono text-xs font-medium text-valence-text truncate">{t.name}</span>
                    {t.description && <span className="mt-0.5 block text-[11px] text-valence-subtle line-clamp-2">{t.description}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {runTool && <ToolRunner connector={row} tool={runTool} onClose={() => setRunTool(null)} />}
    </div>
  )
}

function ToolRunner({ connector, tool, onClose }) {
  const schema = tool.inputSchema && typeof tool.inputSchema === 'object' ? tool.inputSchema : null
  const props = schema?.properties || null
  const required = new Set(schema?.required || [])
  const [form, setForm] = useState({})
  const [rawArgs, setRawArgs] = useState('{}')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  function coerce(spec, v) {
    if (v === '' || v == null) return undefined
    if (spec?.type === 'number' || spec?.type === 'integer') { const n = Number(v); return Number.isFinite(n) ? n : undefined }
    if (spec?.type === 'boolean') return v === true || v === 'true'
    if (spec?.type === 'array' || spec?.type === 'object') {
      try { return JSON.parse(v) } catch { return v }
    }
    return v
  }
  const isJsonType = spec => spec?.type === 'array' || spec?.type === 'object'

  async function run() {
    setBusy(true); setError(''); setResult(null)
    try {
      let args = {}
      if (props) {
        for (const [k, spec] of Object.entries(props)) {
          const c = coerce(spec, form[k])
          if (c !== undefined) args[k] = c
        }
      } else {
        try { args = JSON.parse(rawArgs || '{}') } catch { setError('Arguments must be valid JSON.'); setBusy(false); return }
      }
      const res = await callTool(connector, tool.name, args)
      setResult(res)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const resultText = (() => {
    if (!result) return ''
    const content = result?.content
    if (Array.isArray(content)) return content.map(c => c.text ?? JSON.stringify(c)).join('\n')
    return JSON.stringify(result, null, 2)
  })()
  const isError = result?.isError

  return (
    <>
      <div className="fixed inset-0 z-40 bg-valence-ink/20 animate-fade-in-fast" onClick={onClose} />
      <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={onClose}>
        <div onClick={e => e.stopPropagation()} className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-valence-border bg-valence-bg shadow-valence-lg animate-slide-up">
          <div className="flex items-center gap-2 border-b border-valence-border px-5 py-3">
            <Play className="h-4 w-4 text-valence-blue" />
            <div className="min-w-0">
              <div className="font-mono text-sm font-semibold text-valence-text truncate">{tool.name}</div>
              <div className="text-[11px] text-valence-subtle truncate">{connector.name}</div>
            </div>
            <button onClick={onClose} className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-valence-muted hover:bg-valence-surface"><X className="h-4 w-4" /></button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {tool.description && <p className="text-xs text-valence-muted">{tool.description}</p>}

            {props ? Object.entries(props).map(([k, spec]) => (
              <label key={k} className="block">
                <span className="mb-1 flex items-center gap-1 text-xs font-medium text-valence-text">
                  <span className="font-mono">{k}</span>
                  {required.has(k) && <span className="text-valence-danger">*</span>}
                  <span className="text-valence-subtle font-normal">{spec.type || ''}</span>
                </span>
                {spec.type === 'boolean' ? (
                  <input type="checkbox" checked={!!form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.checked }))} />
                ) : isJsonType(spec) ? (
                  <textarea
                    rows={2}
                    value={form[k] ?? ''}
                    onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                    placeholder={'e.g. ["a","b"] or {"key":"value"}'}
                    className={`${inputCls} font-mono`}
                  />
                ) : (
                  <input
                    type={spec.type === 'number' || spec.type === 'integer' ? 'number' : 'text'}
                    value={form[k] ?? ''}
                    onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                    placeholder={spec.description ? String(spec.description).slice(0, 60) : ''}
                    className={inputCls}
                  />
                )}
              </label>
            )) : (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-valence-text">Arguments (JSON)</span>
                <textarea rows={4} value={rawArgs} onChange={e => setRawArgs(e.target.value)} className={`${inputCls} font-mono`} />
              </label>
            )}

            {error && <p className="text-sm text-valence-danger">{error}</p>}

            {result && (
              <div>
                <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-valence-subtle">
                  {isError ? <AlertCircle className="h-3.5 w-3.5 text-valence-danger" /> : <CheckCircle2 className="h-3.5 w-3.5 text-valence-success" />}
                  Result
                </div>
                <pre className={`max-h-56 overflow-auto rounded-lg border p-3 text-xs whitespace-pre-wrap ${isError ? 'border-valence-danger/30 bg-valence-danger-soft text-valence-danger' : 'border-valence-border bg-valence-surface text-valence-text'}`}>{resultText}</pre>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-valence-border px-5 py-3">
            <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-valence-muted hover:bg-valence-surface transition">Close</button>
            <button onClick={run} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-valence-blue px-3 py-2 text-sm font-medium text-white hover:bg-valence-blue-hover transition disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function AddDialog({ onClose, onAdd }) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [transport, setTransport] = useState('http')
  const [authHeader, setAuthHeader] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!name.trim() || !url.trim()) { setError('Name and URL are required.'); return }
    try { new URL(url.trim()) } catch { setError('That URL doesn’t look valid.'); return }
    setBusy(true); setError('')
    try { await onAdd({ name: name.trim(), url: url.trim(), transport, authHeader: authHeader.trim() }) }
    catch (e2) { setError(e2.message); setBusy(false) }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-valence-ink/20 animate-fade-in-fast" onClick={onClose} />
      <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={onClose}>
        <form onClick={e => e.stopPropagation()} onSubmit={submit} className="w-full max-w-md rounded-2xl border border-valence-border bg-valence-bg p-5 shadow-valence-lg animate-slide-up">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-valence-text">Add MCP connector</h2>
            <button type="button" onClick={onClose} className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-valence-muted hover:bg-valence-surface"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-4 space-y-3">
            <Field label="Name">
              <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Client CRM" className={inputCls} />
            </Field>
            <Field label="Server URL">
              <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://mcp.example.com/mcp" className={`${inputCls} font-mono`} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Transport">
                <select value={transport} onChange={e => setTransport(e.target.value)} className={inputCls}>
                  <option value="http">Streamable HTTP</option>
                  <option value="sse">SSE</option>
                </select>
              </Field>
              <Field label="Auth header (optional)">
                <input value={authHeader} onChange={e => setAuthHeader(e.target.value)} placeholder="Bearer …" className={`${inputCls} font-mono`} />
              </Field>
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-valence-danger">{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-valence-muted hover:bg-valence-surface transition">Cancel</button>
            <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-valence-blue px-3 py-2 text-sm font-medium text-white hover:bg-valence-blue-hover transition disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Add &amp; test
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

const inputCls = 'w-full rounded-lg border border-valence-border bg-valence-surface px-2.5 py-1.5 text-sm text-valence-text outline-none focus:border-valence-blue transition'
function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-valence-subtle">{label}</span>
      {children}
    </label>
  )
}
