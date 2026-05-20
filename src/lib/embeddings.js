// Gemini text-embedding-004 — 768-dimensional vectors.
// Routes through the /api/llm proxy so the embedding key never ships in
// the client bundle. Embeddings are Gemini-specific in our stack today
// (Anthropic + OpenAI use different API shapes and we'd need a separate
// vector store for each); when the user switches their chat provider,
// embeddings still flow through Gemini server-side.

import { isGeminiConfigured, llmCallRaw } from './gemini.js'

const MODEL = 'text-embedding-004'
const DIM = 768

export const embeddingsEnabled = () => isGeminiConfigured

export async function embedText(text, { taskType = 'RETRIEVAL_DOCUMENT', title } = {}) {
  if (!text || !text.trim()) return null

  const json = await llmCallRaw({
    url: `/models/${MODEL}:embedContent`,
    body: {
      model: `models/${MODEL}`,
      content: { parts: [{ text: text.slice(0, 20000) }] },
      taskType,
      ...(title ? { title } : {})
    },
    actionType: 'embed'
  })
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
