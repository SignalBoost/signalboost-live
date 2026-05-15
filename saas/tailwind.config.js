/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./saas/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./saas/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./saas/components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: "#030712",         // The deep dark corporate blue-black background
          surface: "#0b1329",    // Darker blue panels for cards and headers
          primary: "#2563eb",    // Sharp blue for action buttons and accents
          secondary: "#3b82f6",  // Vibrant bright blue for text links and gradients
          text: "#f9fafb",       // Pure white-gray for clear headline text
          muted: "#9ca3af",      // Neutral soft gray for secondary paragraphs
        },
      },
    },
  },
  plugins: [],
}
