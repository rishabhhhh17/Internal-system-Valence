// Retrieval-augmented answers grounded in the Valence knowledge base.
// Uses search_knowledge to fetch relevant chunks, stuffs them into a Gemini
// prompt with numbered citations, streams the response back.

import { searchKnowledge } from './knowledge.js'
import { isGeminiConfigured, llmStream } from './gemini.js'
import { firmDisplayName } from './firmIdentity.js'

function buildPrompt({ question, chunks, history = [] }) {
  const context = chunks.map((c, i) => `[${i + 1}] ${c.title || '(untitled)'}\n${(c.content || c.snippet || '').replace(/<<|>>/g, '')}`).join('\n\n---\n\n')

  const priorTurns = history
    .slice(-6)
    .map(m => `${m.role === 'user' ? 'Q' : 'A'}: ${m.text}`)
    .join('\n')

  const firm = firmDisplayName('the firm')
  return `You are the knowledge assistant for ${firm}, a global investment advisory firm. Answer the user's question using ONLY the context below. Write like a senior associate briefing a partner — crisp, pragmatic, factual.

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

  // Stream generation through the multi-provider proxy. The streaming
  // endpoint normalises every upstream's SSE shape into `data: TEXT\n\n`
  // chunks, so we just append each delta as it arrives.
  const prompt = buildPrompt({ question, chunks, history })
  let full = ''
  try {
    const result = await llmStream(prompt, {
      temperature: 0.25,
      maxOutputTokens: 700,
      actionType: 'rag_ask',
      onChunk: (text, fullSoFar) => {
        full = fullSoFar
        onChunk?.(text, fullSoFar)
      }
    })
    full = result.text || full
  } catch (err) {
    onError?.(err)
    throw err
  }

  onDone?.({ answer: full, sources: chunks })
  return { answer: full, sources: chunks }
}
