// Retrieval-augmented answers grounded in the Valence knowledge base.
// Uses search_knowledge to fetch relevant chunks, stuffs them into a Gemini
// prompt with numbered citations, streams the response back.

import { searchKnowledge } from './knowledge.js'
import { geminiKey, isGeminiConfigured } from './gemini.js'

const MODEL_STREAM_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent'

function buildPrompt({ question, chunks, history = [] }) {
  const context = chunks.map((c, i) => `[${i + 1}] ${c.title || '(untitled)'}\n${(c.content || c.snippet || '').replace(/<<|>>/g, '')}`).join('\n\n---\n\n')

  const priorTurns = history
    .slice(-6)
    .map(m => `${m.role === 'user' ? 'Q' : 'A'}: ${m.text}`)
    .join('\n')

  return `You are the knowledge assistant for Valence Growth Partners, a global investment advisory firm based in Mumbai and London. Answer the user's question using ONLY the context below. Write like a senior associate briefing a partner — crisp, pragmatic, factual.

Rules:
- Cite sources inline using the [N] markers that match the numbered context items.
- If the answer is not supported by the context, say so plainly in one sentence. Do not guess.
- Plain paragraphs. No headings, no bullet lists, no emojis, no markdown.
- Keep the answer under 180 words unless the question demands more.

CONTEXT:
${context || '(no matching documents)'}

${priorTurns ? 'RECENT CONVERSATION:\n' + priorTurns + '\n\n' : ''}QUESTION: ${question}

ANSWER:`
}

export async function askWithStreaming(question, {
  history = [],
  onStart,
  onSources,
  onChunk,
  onDone,
  onError,
  matchCount = 10
} = {}) {
  if (!isGeminiConfigured) {
    const err = new Error('Gemini API key not configured — add VITE_GEMINI_API_KEY to unlock Ask.')
    onError?.(err)
    throw err
  }

  onStart?.()

  // Retrieve
  let chunks = []
  try {
    const { results } = await searchKnowledge(question, { matchCount })
    chunks = results || []
    onSources?.(chunks)
  } catch (err) {
    onError?.(err)
    throw err
  }

  // Stream generation
  const prompt = buildPrompt({ question, chunks, history })
  const res = await fetch(`${MODEL_STREAM_URL}?key=${geminiKey}&alt=sse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.25, maxOutputTokens: 700 }
    })
  })
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => '')
    const err = new Error(`Gemini error ${res.status}: ${t.slice(0, 200)}`)
    onError?.(err)
    throw err
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let full = ''
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const json = JSON.parse(payload)
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || ''
        if (text) {
          full += text
          onChunk?.(text, full)
        }
      } catch {
        // Occasionally Gemini returns a chunk mid-line; leave it in the buffer
      }
    }
  }

  onDone?.({ answer: full, sources: chunks })
  return { answer: full, sources: chunks }
}
