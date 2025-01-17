/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#4A154B',
        secondary: '#36C5F0',
        success: '#2EB67D',
        warning: '#ECB22E',
        error: '#E01E5A'
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
} 