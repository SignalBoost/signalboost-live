/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Replace these hex codes with the exact colors from www.signalboostapp.com
        brand: {
          bg: "#020617",        // Main background color
          surface: "#0f172a",   // Card/navigation background
          primary: "#2563eb",   // Buttons, active links, primary accents
          secondary: "#6366f1", // Secondary gradients or borders
          text: "#f8fafc",      // Primary text color
          muted: "#94a3b8",     // Subtitles / disabled text
        },
      },
    },
  },
  plugins: [],
};
