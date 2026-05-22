import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vercel injects VERCEL_GIT_COMMIT_REF at build time (e.g. 'main',
// 'rishabh-testing'). Surface it to the client as import.meta.env so
// the topbar can show which branch a deploy is serving — useful when
// the dev needs to confirm they're on the testing lane and not on prod.
const branch = process.env.VERCEL_GIT_COMMIT_REF || process.env.VITE_BRANCH || ''

export default defineConfig({
  define: {
    'import.meta.env.VITE_BRANCH': JSON.stringify(branch)
  },
  plugins: [react()],
  server: {
    port: 5173,
    open: true
  },
  build: {
    // Split the heavy third-party dependencies into their own chunks so
    // first-paint isn't blocked by a 1.2 MB bundle. pdf.js + mammoth
    // (DOCX → HTML) are only used inside Knowledge → Files upload, so
    // they don't need to load on /, /deals, etc. lucide-react ships
    // hundreds of icons — code-splitting keeps the unused ones out of
    // the initial chunk.
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-pdf':      ['pdfjs-dist'],
          'vendor-docx':     ['mammoth'],
          'vendor-react':    ['react', 'react-dom', 'react-router-dom'],
          'vendor-dates':    ['date-fns'],
          'vendor-icons':    ['lucide-react'],
          'vendor-supabase': ['@supabase/supabase-js']
        }
      }
    },
    chunkSizeWarningLimit: 700  // we still warn, but only on really fat chunks
  }
})
