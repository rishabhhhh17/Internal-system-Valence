/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        valence: {
          bg: '#0a0f1e',
          surface: '#0f1629',
          elevated: '#141c33',
          border: 'rgba(255,255,255,0.08)',
          'border-strong': 'rgba(255,255,255,0.14)',
          blue: '#3399FF',
          'blue-hover': '#1a85ff',
          'blue-soft': 'rgba(51,153,255,0.12)',
          'blue-ring': 'rgba(51,153,255,0.35)',
          text: '#ffffff',
          muted: '#94a3b8',
          subtle: '#64748b',
          success: '#34d399',
          warning: '#fbbf24',
          danger: '#f87171'
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif']
      },
      boxShadow: {
        'valence': '0 8px 32px rgba(0,0,0,0.35)',
        'valence-glow': '0 0 0 1px rgba(51,153,255,0.35), 0 8px 32px rgba(51,153,255,0.15)'
      },
      backgroundImage: {
        'valence-radial': 'radial-gradient(80% 60% at 20% 0%, rgba(51,153,255,0.10) 0%, rgba(10,15,30,0) 60%), radial-gradient(60% 50% at 100% 10%, rgba(51,153,255,0.06) 0%, rgba(10,15,30,0) 60%)',
        'valence-hero': 'linear-gradient(180deg, rgba(51,153,255,0.08) 0%, rgba(10,15,30,0) 70%)'
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.25s ease-out',
        'slide-up': 'slideUp 0.3s ease-out'
      },
      keyframes: {
        fadeIn: { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        slideInRight: { '0%': { transform: 'translateX(20px)', opacity: 0 }, '100%': { transform: 'translateX(0)', opacity: 1 } },
        slideUp: { '0%': { transform: 'translateY(10px)', opacity: 0 }, '100%': { transform: 'translateY(0)', opacity: 1 } }
      }
    }
  },
  plugins: []
}
