/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Warp-style dark theme - Enhanced
        'dark': '#050505',
        'dark-secondary': '#0a0e14',
        'dark-tertiary': '#1c2128',
        
        // Surfaces - Better contrast
        'surface': '#0f1117',
        'surface-secondary': '#1c2128',
        'surface-hover': '#1e293b',
        
        // Borders - More visible
        'border-primary': 'rgba(255,255,255,0.1)',
        'border-hover': 'rgba(255,255,255,0.2)',
        
        // Text colors - Better hierarchy
        'text-primary': '#e1e1e6',
        'text-secondary': '#a0a0ab',
        'muted': '#6b6b76',
        'dim': '#a0a0ab',
        
        // Accent colors (Warp-style cyan and violet)
        'accent': '#22d3ee',
        'accent-secondary': '#a78bfa',
        'purple': '#a78bfa',
        
        // Semantic colors - More vibrant
        'success': '#34d399',
        'error': '#f87171',
        'warning': '#fbbf24',
        'info': '#60a5fa',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'Monaco', 'monospace'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        'cyan-glow': '0 0 20px -5px rgba(34,211,238,0.2)',
        'purple-glow': '0 0 20px -5px rgba(167,139,250,0.2)',
        'glow': '0 0 15px rgba(34,211,238,0.15)',
        'glow-strong': '0 0 25px rgba(34,211,238,0.2)',
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
      fontSize: {
        'xxs': '0.625rem',
      },
      lineHeight: {
        'relaxed': '1.625',
      }
    },
  },
  plugins: [],
}
