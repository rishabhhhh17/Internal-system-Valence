// Client-side text extraction for uploaded files.
// Heavy parsers (pdfjs, mammoth) are dynamically imported so they only hit the
// bundle when a user actually uploads a matching file type.

export const SUPPORTED_TYPES = {
  'application/pdf':                                                        'pdf',
  'application/msword':                                                     'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx',
  'text/plain':                                                             'txt',
  'text/markdown':                                                          'md',
  'text/csv':                                                               'csv',
  'text/html':                                                              'html'
}

export function fileTypeFor(file) {
  if (SUPPORTED_TYPES[file.type]) return SUPPORTED_TYPES[file.type]
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  if (['pdf','docx','doc','txt','md','csv','html','htm'].includes(ext)) return ext === 'htm' ? 'html' : ext
  return null
}

export async function extractText(file, { onProgress } = {}) {
  const type = fileTypeFor(file)
  if (!type) throw new Error(`Unsupported file type: ${file.type || file.name}`)
  onProgress?.(0.05, 'Reading file')

  if (type === 'pdf')  return extractPdf(file, onProgress)
  if (type === 'docx') return extractDocx(file, onProgress)
  if (type === 'doc')  throw new Error('Legacy .doc files are not supported. Please save as .docx or PDF.')
  if (type === 'html') {
    const text = await file.text()
    return stripHtml(text)
  }
  // txt / md / csv
  return file.text()
}

async function extractPdf(file, onProgress) {
  const pdfjs = await import('pdfjs-dist')
  // Workers: use the bundled worker URL so we don't depend on any CDN
  const workerSrc = await import('pdfjs-dist/build/pdf.worker.min.mjs?url').then(m => m.default).catch(() => null)
  if (workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

  const buf = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data: buf }).promise
  const total = doc.numPages
  const pages = []
  for (let i = 1; i <= total; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map(it => (typeof it.str === 'string' ? it.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    pages.push(text)
    onProgress?.(0.05 + 0.6 * (i / total), `Parsing page ${i}/${total}`)
  }
  return pages.join('\n\n')
}

async function extractDocx(file, onProgress) {
  const mammoth = await import('mammoth/mammoth.browser.js')
  onProgress?.(0.2, 'Parsing .docx')
  const buf = await file.arrayBuffer()
  const { value } = await mammoth.extractRawText({ arrayBuffer: buf })
  return (value || '').replace(/\s+\n/g, '\n').trim()
}

function stripHtml(html) {
  const tmp = new DOMParser().parseFromString(html, 'text/html')
  return tmp.body?.innerText || tmp.documentElement.textContent || ''
}

// Split a long text into overlapping chunks suitable for embedding + retrieval.
// Defaults tuned for text-embedding-004: ~800 words per chunk with 120-word overlap.
export function chunkText(text, { words = 800, overlap = 120 } = {}) {
  const clean = (text || '').replace(/\s+/g, ' ').trim()
  if (!clean) return []
  const tokens = clean.split(' ')
  if (tokens.length <= words) return [clean]
  const chunks = []
  const step = Math.max(1, words - overlap)
  for (let i = 0; i < tokens.length; i += step) {
    const slice = tokens.slice(i, i + words)
    if (slice.length < 40 && chunks.length > 0) break
    chunks.push(slice.join(' '))
    if (i + words >= tokens.length) break
  }
  return chunks
}
