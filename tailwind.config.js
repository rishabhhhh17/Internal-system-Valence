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
        // Body + UI: Inter (editorial cut)
        sans:    ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        // Display: Fraunces for hero headlines — classical, editorial, boutique
        display: ['Fraunces', 'Cormorant Garamond', 'ui-serif', 'Georgia', 'serif']
      },
      fontSize: {
        // Editorial scale — optimized for the Valence boutique feel
        'hero':   ['clamp(2.5rem, 5vw + 0.5rem, 4.75rem)', { lineHeight: '1.04', letterSpacing: '-0.025em' }],
        'display':['clamp(2rem, 3.5vw + 0.25rem, 3.25rem)',  { lineHeight: '1.08', letterSpacing: '-0.02em' }]
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
        'slide-in-right': 'slideInRight 0.25s ease-out',
        'slide-up':       'slideUp 0.3s ease-out'
      },
      keyframes: {
        fadeIn:        { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        slideInRight:  { '0%': { transform: 'translateX(20px)', opacity: 0 }, '100%': { transform: 'translateX(0)', opacity: 1 } },
        slideUp:       { '0%': { transform: 'translateY(10px)', opacity: 0 }, '100%': { transform: 'translateY(0)', opacity: 1 } }
      }
    }
  },
  plugins: []
}
