// ============================================================
// MCP connectors — clients bring their own MCP servers.
//
// A workspace registers an MCP endpoint (Model Context Protocol) and the
// tool exposes its tools. Storage + management live here; live discovery
// is a best-effort browser handshake (many MCP servers will need a
// server-side proxy for CORS, which is the production path).
// ============================================================
import { supabase } from './supabase.js'

// The workspace the signed-in user belongs to (RLS scopes it to their own
// membership). Self-contained here so Connectors has no other dependencies.
export async function getMyWorkspaceId() {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.workspace_id || null
}

export async function listConnectors(workspaceId) {
  const { data, error } = await supabase
    .from('mcp_connectors')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function addConnector({ workspaceId, name, url, transport = 'http', authHeader = null }) {
  const { data, error } = await supabase
    .from('mcp_connectors')
    .insert({ workspace_id: workspaceId, name, url, transport, auth_header: authHeader || null })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateConnector(id, patch) {
  const { data, error } = await supabase.from('mcp_connectors').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function removeConnector(id) {
  const { error } = await supabase.from('mcp_connectors').delete().eq('id', id)
  if (error) throw error
}

// ---- Live MCP via the server-side proxy (Supabase Edge Function) ----
// The `mcp-proxy` function forwards JSON-RPC to the registered MCP server
// server-side, so there's no browser CORS wall. It only reaches URLs the
// caller's workspace has registered (RLS-scoped, SSRF-safe).

// Returns { status: 'connected'|'error', detail, tools:[{name,description}] }
export async function discoverTools(connector) {
  try {
    const { data, error } = await supabase.functions.invoke('mcp-proxy', {
      body: { connectorId: connector.id, discover: true },
    })
    if (error) return { status: 'error', detail: error.message, tools: [] }
    return data
  } catch (e) {
    return { status: 'error', detail: e.message, tools: [] }
  }
}

// Execute one of a connector's tools live, through the proxy. Throws on any
// failure (transport, proxy, or JSON-RPC error) so callers surface it as an
// error instead of rendering a failed envelope as a success.
export async function callTool(connector, name, args = {}) {
  const { data, error } = await supabase.functions.invoke('mcp-proxy', {
    body: { connectorId: connector.id, method: 'tools/call', params: { name, arguments: args } },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  const rpc = data?.body
  if (rpc?.error) throw new Error(rpc.error.message || 'The tool returned an error.')
  if (data?.ok === false) throw new Error(`The MCP server returned HTTP ${data.status}.`)
  if (!rpc?.result) throw new Error('The tool returned no result.')
  return rpc.result
}

// Test + persist the result in one call.
export async function testConnector(connector) {
  const result = await discoverTools(connector)
  const saved = await updateConnector(connector.id, {
    status: result.status,
    status_detail: result.detail,
    tools: result.tools,
    last_checked_at: new Date().toISOString(),
  })
  return saved
}
