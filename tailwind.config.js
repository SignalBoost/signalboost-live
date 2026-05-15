/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./saas/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./saas/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#060913",
        foreground: "#f8fafc",
      },
    },
  },
  plugins: [
    function ({ addUtilities }) {
      addUtilities({
        '.fathom-glass': {
          'background-color': 'rgba(22, 28, 45, 0.70)',
          'backdrop-filter': 'blur(16px)',
          '-webkit-backdrop-filter': 'blur(16px)',
          'border': '1px solid rgba(255, 255, 255, 0.15)',
          'box-shadow': '0 4px 30px rgba(0, 0, 0, 0.40)',
        },
      })
    },
  ],
};
