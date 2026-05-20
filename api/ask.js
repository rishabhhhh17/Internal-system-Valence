// /api/ask — Natural-language query over the Valence relationship CRM.
//
// Flow:
//   1. Validate the user's Supabase JWT.
//   2. Build a per-request Supabase client bound to that JWT so every
//      tool call respects org RLS.
//   3. Call Gemini Flash with the system prompt + 6 tool declarations.
//   4. If Gemini returns a functionCall, execute the corresponding
//      tool against Supabase, append the result, call Gemini again.
//   5. Loop up to MAX_TOOL_TURNS (4) — the model rarely needs more.
//   6. Stream the final text back to the client as SSE.
//
// Anti-hallucination is enforced at three layers:
//   - System prompt (verbatim from spec) tells the model to never fill
//     in facts from its own knowledge.
//   - Every tool returns { results, match_count } so the model can
//     reliably detect "no data" cases.
//   - Tool implementations select bucket only — internal numeric
//     scores never leak to the model, so even a hallucinating model
//     can't quote a number it wasn't given.
//
// The system prompt is reproduced exactly from the spec. Do not edit
// without a corresponding update to the spec doc.

import { createClient } from '@supabase/supabase-js'
import { TOOL_DECLARATIONS, TOOL_IMPLEMENTATIONS } from './_ask-tools.js'

const SUPABASE_URL      = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
const GEMINI_API_KEY    = process.env.GEMINI_API_KEY
const GEMINI_MODEL      = 'gemini-2.0-flash'

const MAX_TOOL_TURNS = 4

const SYSTEM_PROMPT = `You are the query interface for ValenceOS, the internal CRM for Valence Growth Partners. You answer questions about the firm's relationships, deals, and contacts.

CRITICAL RULES:
1. You may only state facts that are returned by the tools provided to you. Never use your own knowledge to fill in names, emails, company details, or any other facts about people or companies.
2. If a tool returns no results, say so honestly. Suggest a different search or ask a clarifying question. Never make up names or details.
3. If a tool returns multiple plausible matches, list them and ask the user to disambiguate. Never pick one and present it as the answer.
4. Every factual claim you make must be grounded in the tool data shown to you in this turn. If you mention a person's name, that name must come from the tool result. If you mention a number of interactions, it must come from the tool result.
5. Always cite the underlying data. For example: "Rohan Mehta at ChrysCapital, based on 12 interactions with Manav, most recent on April 15."
6. Never display numeric relationship scores. Use the bucket labels: Strong, Warm, Cool, Cold.
7. Keep responses concise. Avoid filler phrases like "Great question!" or "Let me check that for you."
8. If a question is ambiguous, ask one clarifying question before searching. Do not run multiple tools speculatively.

You have access to tools that query the Valence CRM database. Choose the most specific tool for the question. If no tool fits, say "I don't have a way to answer that from the CRM data."`

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    return res.status(204).end()
  }
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!GEMINI_API_KEY)   return res.status(503).json({ error: 'GEMINI_API_KEY not set on server' })
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY)
    return res.status(503).json({ error: 'Supabase not configured on server' })

  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return res.status(401).json({ error: 'Missing bearer token' })

  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
  body = body || {}
  const question = String(body.question || '').trim()
  if (!question) return res.status(400).json({ error: 'question required' })

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth:   { persistSession: false, autoRefreshToken: false }
  })

  // Open SSE channel — client renders incrementally as chunks arrive.
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  const send = (event, payload) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
  }

  // Gemini conversation state. We use the REST API directly because
  // the @google/generative-ai SDK adds a layer we don't need here.
  const contents = [
    { role: 'user', parts: [{ text: question }] }
  ]

  try {
    let turn = 0
    while (turn < MAX_TOOL_TURNS) {
      turn += 1
      const reply = await callGemini(contents)
      const cand = reply?.candidates?.[0]
      if (!cand) {
        send('error', { message: 'Empty Gemini response' })
        break
      }
      const parts = cand?.content?.parts || []
      const funcCall = parts.find(p => p.functionCall)

      if (funcCall) {
        const { name, args } = funcCall.functionCall
        send('tool_call', { name, args })

        const impl = TOOL_IMPLEMENTATIONS[name]
        let toolResult
        if (!impl) {
          toolResult = { error: `Unknown tool: ${name}`, results: [], match_count: 0 }
        } else {
          try {
            toolResult = await impl(sb, args || {})
          } catch (err) {
            toolResult = { error: err?.message || 'tool failed', results: [], match_count: 0 }
          }
        }
        send('tool_result', { name, match_count: toolResult.match_count, has_error: !!toolResult.error })

        contents.push({ role: 'model', parts: [{ functionCall: funcCall.functionCall }] })
        contents.push({
          role: 'user',
          parts: [{ functionResponse: { name, response: toolResult } }]
        })
        continue
      }

      // No function call — model returned its final text.
      const text = parts.map(p => p.text || '').join('')
      // Stream the text in small chunks so the UI feels alive even on
      // a one-shot response.
      const chunkSize = 24
      for (let i = 0; i < text.length; i += chunkSize) {
        send('chunk', { text: text.slice(i, i + chunkSize) })
      }
      send('done', { turns: turn })
      break
    }
    if (turn >= MAX_TOOL_TURNS) {
      send('done', { turns: turn, note: 'max tool turns reached' })
    }
  } catch (err) {
    send('error', { message: err?.message || 'ask failed' })
  } finally {
    res.end()
  }
}

// ============ GEMINI CALL ============
async function callGemini(contents) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`
  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    tools: [{ function_declarations: TOOL_DECLARATIONS }],
    generationConfig: {
      temperature: 0.15,
      maxOutputTokens: 1500,
      // Force tool_use over freeform when the question looks data-driven.
      // 'AUTO' is fine for now; we can tighten to 'ANY' to require a
      // tool call on the first turn if the model hallucinates.
    }
  }
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!r.ok) {
    const txt = await r.text().catch(() => '')
    throw new Error(`Gemini ${r.status}: ${txt.slice(0, 200)}`)
  }
  return r.json()
}
