
const config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      /* ─── Fonts ─── */
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        syne: ['Syne', 'sans-serif'],
        serif: ['Instrument Serif', 'Georgia', 'serif'],
        dm: ['DM Sans', 'sans-serif'],
      },

      /* ─── Brand colours ─── */
      colors: {
        ink: {
          DEFAULT: '#0A0D12',
          2: '#1C2333',
          3: '#3A4A5C',
        },
        blue: {
          DEFAULT: '#1246FF',
          2: '#3366FF',
          dk: '#0D3AE0',
          lt: '#E8EFFE',
        },
        cream: '#F5F0E8',
        warm: '#EDE8DC',
        gold: '#C8A84B',
        green: {
          DEFAULT: '#0D7C54',
          2: '#12B07A',
          lt: '#D1FAE5',
        },
        brand: {
          red: '#D42B2B',
          'red-lt': '#FDEAEA',
        },
        muted: '#6B7689',
        pale: '#9AAAB8',
        divider: '#E2DDD4',
        surface: '#FDFCF9',
        bg: '#F4F7FB',
      },

      /* ─── Border radius ─── */
      borderRadius: {
        sm: '8px',
        DEFAULT: '12px',
        lg: '18px',
        xl: '24px',
        '2xl': '32px',
        full: '9999px',
      },

      /* ─── Shadows ─── */
      boxShadow: {
        sm: '0 1px 3px rgba(10,13,18,.06), 0 4px 12px rgba(10,13,18,.05)',
        DEFAULT: '0 4px 16px rgba(10,13,18,.08)',
        lg: '0 8px 40px rgba(10,13,18,.12), 0 2px 8px rgba(10,13,18,.06)',
        xl: '0 24px 80px rgba(10,13,18,.14), 0 4px 16px rgba(10,13,18,.06)',
        blue: '0 4px 24px rgba(18,70,255,.25)',
        'blue-lg': '0 8px 40px rgba(18,70,255,.35)',
      },

      /* ─── Spacing / sizing ─── */
      spacing: {
        'nav-w': '252px',
        'top-h': '58px',
        '18': '4.5rem',
        '22': '5.5rem',
        '30': '7.5rem',
      },

      /* ─── Typography ─── */
      fontSize: {
        '10': ['10px', { lineHeight: '1.4' }],
        '11': ['11px', { lineHeight: '1.4' }],
        '13': ['13px', { lineHeight: '1.55' }],
        'display-xl': ['clamp(52px, 7vw, 96px)', { lineHeight: '0.93', letterSpacing: '-0.04em' }],
        'display-lg': ['clamp(36px, 5vw, 64px)', { lineHeight: '0.95', letterSpacing: '-0.035em' }],
        'display-md': ['clamp(28px, 3.5vw, 48px)', { lineHeight: '1', letterSpacing: '-0.03em' }],
      },

      /* ─── Letter spacing ─── */
      letterSpacing: {
        tightest: '-0.04em',
        tighter: '-0.03em',
        tight: '-0.02em',
        snug: '-0.01em',
        wide: '0.06em',
        wider: '0.10em',
        widest: '0.14em',
      },

      /* ─── Animations ─── */
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(24px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        fadeRight: {
          from: { opacity: '0', transform: 'translateX(32px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        floatY: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.5', transform: 'scale(0.8)' },
        },
        scrollLeft: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        notifSlideIn: {
          from: { opacity: '0', transform: 'translateY(12px) scale(0.95)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        blobPulse: {
          '0%, 100%': { transform: 'scale(1) rotate(0deg)' },
          '33%': { transform: 'scale(1.05) rotate(3deg)' },
          '66%': { transform: 'scale(0.97) rotate(-2deg)' },
        },
      },
      animation: {
        'fade-up': 'fadeUp 0.6s ease both',
        'fade-in': 'fadeIn 0.5s ease both',
        'fade-right': 'fadeRight 0.6s ease both',
        'float': 'floatY 3s ease-in-out infinite',
        'pulse-dot': 'pulseDot 2s ease-in-out infinite',
        'scroll-left': 'scrollLeft 30s linear infinite',
        'shimmer': 'shimmer 1.5s infinite',
        'notif': 'notifSlideIn 0.4s ease both',
        'blob': 'blobPulse 8s ease-in-out infinite',
      },

      /* ─── Background image ─── */
      backgroundImage: {
        'grain': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        'mini-grid': "linear-gradient(rgba(80,120,180,.15) 1px, transparent 1px), linear-gradient(90deg, rgba(80,120,180,.15) 1px, transparent 1px)",
      },

      /* ─── Z-index ─── */
      zIndex: {
        'nav': '100',
        'sidebar': '200',
        'modal': '300',
        'toast': '400',
        'cursor': '9999',
      },

      /* ─── Screen ─── */
      screens: {
        'xs': '375px',
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1440px',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config