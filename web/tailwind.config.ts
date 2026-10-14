import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#4F46E5',
          dark: '#4338CA',
          light: '#EEF2FF',
        },
        ink: '#18181B',
        muted: '#64748B',
        page: '#F8FAFC',
        line: '#E5E7EB',
      },
      borderRadius: {
        md2: '8px',
        lg2: '12px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 24, 40, 0.05)',
        pop: '0 8px 24px rgba(16, 24, 40, 0.12)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
