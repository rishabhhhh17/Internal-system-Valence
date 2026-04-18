/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        valence: {
          // Boutique light palette — mirrors valencegrowth.com
          bg:            '#ffffff',
          surface:       '#fafafa',
          elevated:      '#ffffff',
          'ink':         '#0a0f1e',   // deep navy reserved for contrast panels (sidebar, hero mark, footer)
          'ink-soft':    '#0f1a34',

          border:        'rgba(10, 15, 30, 0.08)',
          'border-strong':'rgba(10, 15, 30, 0.14)',
          'border-ink':  'rgba(255, 255, 255, 0.10)', // for use on ink backgrounds

          blue:          '#3399FF',
          'blue-hover':  '#1a85ff',
          'blue-deep':   '#1a66cc',
          'blue-soft':   '#e6f2ff',
          'blue-ring':   'rgba(51, 153, 255, 0.22)',

          text:          '#0a0f1e',
          muted:         '#475569',
          subtle:        '#94a3b8',
          faint:         '#cbd5e1',

          success:       '#059669',
          'success-soft':'#d1fae5',
          warning:       '#b45309',
          'warning-soft':'#fef3c7',
          danger:        '#dc2626',
          'danger-soft': '#fee2e2'
        }
      },
      fontFamily: {
        // Body + UI + display: Inter throughout (tight-tracked for headlines)
        sans:    ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif']
      },
      fontSize: {
        // Mirrors the valencegrowth.com rhythm — tight tracking, snug line-height,
        // heavy weight expected.
        'hero':    ['clamp(2.75rem, 5.5vw + 0.5rem, 5.5rem)',  { lineHeight: '1.02', letterSpacing: '-0.035em' }],
        'display': ['clamp(2.25rem, 3.5vw + 0.25rem, 3.75rem)',{ lineHeight: '1.04', letterSpacing: '-0.03em'  }],
        'feature': ['clamp(1.75rem, 2.2vw + 0.25rem, 2.5rem)', { lineHeight: '1.1',  letterSpacing: '-0.02em'  }]
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
        'ink-grain':      'radial-gradient(80% 50% at 10% 0%, rgba(51,153,255,0.14) 0%, rgba(10,15,30,0) 60%)'
      },
      animation: {
        'fade-in':        'fadeIn 0.3s ease-out',
        'fade-in-fast':   'fadeIn 0.15s ease-out',
        'slide-in-right': 'slideInRight 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
        'slide-up':       'slideUp 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
        'slide-up-sm':    'slideUpSm 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
        'pulse-soft':     'pulseSoft 2s ease-in-out infinite',
        'shimmer':        'shimmer 2s linear infinite'
      },
      keyframes: {
        fadeIn:        { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        slideInRight:  { '0%': { transform: 'translateX(30px)', opacity: 0 }, '100%': { transform: 'translateX(0)', opacity: 1 } },
        slideUp:       { '0%': { transform: 'translateY(12px)', opacity: 0 }, '100%': { transform: 'translateY(0)', opacity: 1 } },
        slideUpSm:     { '0%': { transform: 'translateY(4px)', opacity: 0 }, '100%': { transform: 'translateY(0)', opacity: 1 } },
        pulseSoft:     { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.6 } },
        shimmer:       { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } }
      }
    }
  },
  plugins: []
}
