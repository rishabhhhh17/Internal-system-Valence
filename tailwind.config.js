/** @type {import('tailwindcss').Config} */
import typography from '@tailwindcss/typography'

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Palette is CSS-variable-backed so the same `bg-valence-bg` class
        // flips between light + dark themes automatically when the `.dark`
        // class is toggled on <html>. Light values live in :root, dark
        // values in :root.dark — both in src/index.css. RGB-triplet form
        // (`51 153 255` not `#3399ff`) is what unlocks Tailwind's `/N`
        // opacity modifier (`bg-valence-blue/20` etc.) — heavily used.
        valence: {
          bg:             'rgb(var(--valence-bg) / <alpha-value>)',
          surface:        'rgb(var(--valence-surface) / <alpha-value>)',
          elevated:       'rgb(var(--valence-elevated) / <alpha-value>)',
          ink:            'rgb(var(--valence-ink) / <alpha-value>)',
          'ink-soft':     'rgb(var(--valence-ink-soft) / <alpha-value>)',

          // Borders + rings stay as full rgba — they're meant as low-alpha
          // overlays rather than semantic palette colors. Variables let
          // them swap on theme change without per-component patches.
          border:         'var(--valence-border)',
          'border-strong':'var(--valence-border-strong)',
          'border-ink':   'var(--valence-border-ink)',

          blue:           'rgb(var(--valence-blue) / <alpha-value>)',
          'blue-hover':   'rgb(var(--valence-blue-hover) / <alpha-value>)',
          'blue-deep':    'rgb(var(--valence-blue-deep) / <alpha-value>)',
          'blue-soft':    'rgb(var(--valence-blue-soft) / <alpha-value>)',
          'blue-ring':    'var(--valence-blue-ring)',

          text:           'rgb(var(--valence-text) / <alpha-value>)',
          muted:          'rgb(var(--valence-muted) / <alpha-value>)',
          subtle:         'rgb(var(--valence-subtle) / <alpha-value>)',
          faint:          'rgb(var(--valence-faint) / <alpha-value>)',

          success:        'rgb(var(--valence-success) / <alpha-value>)',
          'success-soft': 'rgb(var(--valence-success-soft) / <alpha-value>)',
          warning:        'rgb(var(--valence-warning) / <alpha-value>)',
          'warning-soft': 'rgb(var(--valence-warning-soft) / <alpha-value>)',
          danger:         'rgb(var(--valence-danger) / <alpha-value>)',
          'danger-soft':  'rgb(var(--valence-danger-soft) / <alpha-value>)'
        }
      },
      fontFamily: {
        // Manrope is the primary face on valencegrowth.com; Oxygen is used
        // for accents. Both are loaded from Google Fonts in index.html.
        sans:    ['Manrope', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Manrope', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        oxygen:  ['Oxygen', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif']
      },
      fontSize: {
        // Tuned for Manrope — softer, geometric face; needs slightly less
        // aggressive negative tracking than Inter.
        'hero':    ['clamp(2.75rem, 5.5vw + 0.5rem, 5.5rem)',  { lineHeight: '1.05', letterSpacing: '-0.03em'  }],
        'display': ['clamp(2.25rem, 3.5vw + 0.25rem, 3.75rem)',{ lineHeight: '1.08', letterSpacing: '-0.025em' }],
        'feature': ['clamp(1.75rem, 2.2vw + 0.25rem, 2.5rem)', { lineHeight: '1.12', letterSpacing: '-0.02em'  }]
      },
      boxShadow: {
        'valence':      '0 1px 2px rgba(10, 15, 30, 0.04), 0 8px 24px rgba(10, 15, 30, 0.06)',
        'valence-lg':   '0 1px 2px rgba(10, 15, 30, 0.05), 0 20px 48px rgba(10, 15, 30, 0.09)',
        'valence-glow': '0 0 0 1px rgba(51, 153, 255, 0.35), 0 10px 32px rgba(51, 153, 255, 0.20)',
        'ink-glow':     '0 20px 40px rgba(10, 15, 30, 0.45)'
      },
      backgroundImage: {
        'valence-radial': 'radial-gradient(70% 60% at 15% 0%, rgba(51,153,255,0.10) 0%, rgba(255,255,255,0) 50%), radial-gradient(50% 40% at 100% 0%, rgba(51,153,255,0.05) 0%, rgba(255,255,255,0) 55%)',
        'valence-hero':   'linear-gradient(180deg, rgba(230,242,255,0.9) 0%, rgba(255,255,255,0) 70%)',
        'ink-grain':      'radial-gradient(80% 50% at 10% 0%, rgba(51,153,255,0.14) 0%, rgba(10,15,30,0) 60%)',
        /* Liquid-Glass aurora — richer color blobs so frosted chrome has
           something to refract against. Used by the .vl-aurora layer. */
        'valence-aurora': 'radial-gradient(45% 40% at 12% 8%,   rgba(51,153,255,0.28)  0%, rgba(255,255,255,0) 55%),\
                           radial-gradient(35% 35% at 92% 14%,  rgba(149,210,255,0.22) 0%, rgba(255,255,255,0) 55%),\
                           radial-gradient(40% 40% at 70% 90%,  rgba(255,189,127,0.18) 0%, rgba(255,255,255,0) 55%),\
                           radial-gradient(40% 40% at 25% 88%,  rgba(189,148,255,0.18) 0%, rgba(255,255,255,0) 55%)'
      },
      animation: {
        'fade-in':        'fadeIn 0.3s ease-out',
        'fade-in-fast':   'fadeIn 0.15s ease-out',
        'slide-in-right': 'slideInRight 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
        'slide-up':       'slideUp 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
        'slide-up-sm':    'slideUpSm 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
        'pulse-soft':     'pulseSoft 2s ease-in-out infinite',
        'shimmer':        'shimmer 2s linear infinite',
        // Soft attention-grabber for the Tour pill on first visit.
        // Glow pulses the box-shadow + background. Ring grows + fades.
        'attention-glow': 'attentionGlow 2.2s ease-in-out infinite',
        'attention-ring': 'attentionRing 2.2s ease-out infinite'
      },
      keyframes: {
        fadeIn:        { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        slideInRight:  { '0%': { transform: 'translateX(30px)', opacity: 0 }, '100%': { transform: 'translateX(0)', opacity: 1 } },
        slideUp:       { '0%': { transform: 'translateY(12px)', opacity: 0 }, '100%': { transform: 'translateY(0)', opacity: 1 } },
        slideUpSm:     { '0%': { transform: 'translateY(4px)', opacity: 0 }, '100%': { transform: 'translateY(0)', opacity: 1 } },
        pulseSoft:     { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.6 } },
        shimmer:       { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        attentionGlow: {
          '0%,100%': { boxShadow: '0 0 0 0 rgba(51,153,255,0.55), 0 0 0 0 rgba(51,153,255,0.0)' },
          '50%':     { boxShadow: '0 0 0 4px rgba(51,153,255,0.18), 0 0 12px 2px rgba(51,153,255,0.35)' }
        },
        attentionRing: {
          '0%':   { transform: 'scale(0.85)', opacity: 0.65 },
          '70%':  { transform: 'scale(1.55)', opacity: 0 },
          '100%': { transform: 'scale(1.55)', opacity: 0 }
        }
      }
    }
  },
  plugins: [typography]
}
