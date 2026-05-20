import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
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
