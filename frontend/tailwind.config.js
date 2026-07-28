/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          main: 'var(--bg-main)',
          card: 'var(--bg-card)',
          input: 'var(--bg-input)',
          sidebar: 'var(--bg-sidebar)',
          hover: 'var(--bg-hover)',
        },
        border: {
          DEFAULT: 'var(--border-color)',
          light: 'var(--border-color-light)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          inverse: 'var(--text-inverse)',
        },
        shadow: {
          DEFAULT: 'var(--shadow-color)',
          light: 'var(--shadow-color-light)',
        },
        primary: {
          DEFAULT: '#5B8CFF',
          hover: '#6B9BFF',
        },
        success: '#22C55E',
        warning: '#F59E0B',
        danger: '#EF4444',
        info: '#38BDF8',
      },
    },
  },
  plugins: [],
}
