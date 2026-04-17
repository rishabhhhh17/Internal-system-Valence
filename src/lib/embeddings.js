// Gemini text-embedding-004 — 768-dimensional vectors.
// Called from the browser with the public VITE_GEMINI_API_KEY.

import { geminiKey, isGeminiConfigured } from './gemini.js'

const MODEL = 'text-embedding-004'
const DIM = 768
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent`

export const embeddingsEnabled = () => isGeminiConfigured

export async function embedText(text, { taskType = 'RETRIEVAL_DOCUMENT', title } = {}) {
  if (!isGeminiConfigured) throw new Error('Gemini API key not configured')
  if (!text || !text.trim()) return null

  const body = {
    model: `models/${MODEL}`,
    content: { parts: [{ text: text.slice(0, 20000) }] },
    taskType,
    ...(title ? { title } : {})
  }
  const res = await fetch(`${URL}?key=${geminiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Embedding error ${res.status}: ${t}`)
  }
  const json = await res.json()
  const values = json?.embedding?.values
  if (!Array.isArray(values) || values.length !== DIM) {
    throw new Error('Unexpected embedding response')
  }
  return values
}

export async function embedQuery(text) {
  return embedText(text, { taskType: 'RETRIEVAL_QUERY' })
}

// Batch helper — Gemini's embeddings API doesn't have a formal batch, but we
// run requests concurrently in small groups to keep throughput reasonable.
export async function embedBatch(texts, { concurrency = 4, onProgress } = {}) {
  const out = new Array(texts.length)
  let done = 0
  async function worker(start) {
    for (let i = start; i < texts.length; i += concurrency) {
      try { out[i] = await embedText(texts[i]) }
      catch { out[i] = null }
      done += 1
      onProgress?.(done / texts.length)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i)))
  return out
}
