/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#2563eb", // primary blue
          light: "#3b82f6",
          dark: "#1e40af",
        },
        accent: {
          DEFAULT: "#f59e0b", // amber for highlights
          light: "#fbbf24",
          dark: "#b45309",
        },
      },
      boxShadow: {
        card: "0 2px 8px rgba(0,0,0,0.08)",
      },
    },
  },
  plugins: [
    function ({ addComponents }) {
      addComponents({
        ".card": {
          "@apply bg-white rounded-lg shadow-card p-6": {},
        },
        ".btn-primary": {
          "@apply bg-brand text-white font-semibold px-4 py-2 rounded hover:bg-brand-dark transition": {},
        },
        ".btn-secondary": {
          "@apply bg-gray-200 text-gray-800 font-semibold px-4 py-2 rounded hover:bg-gray-300 transition": {},
        },
      });
    },
  ],
};
