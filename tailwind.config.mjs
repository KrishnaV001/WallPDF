/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // <--- CRITICAL: Tells Tailwind to listen to the .dark class
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Space Grotesk',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};