/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "../app/**/*.{js,ts,jsx,tsx,mdx}",
    "../pages/**/*.{js,ts,jsx,tsx,mdx}",
    "../components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: "#0b0f19",         // Exact deep dark blue-black background from your main site
          surface: "#111827",    // Card background for partners/offers panels
          accent: "#eab308",     // The solid Gold/Yellow color used on "Explore region"
          accentHover: "#ca8a04",// Darker gold for button hover states
          blueTag: "#3b82f6",    // Bright blue color used for tags like "Flights", "Hotels"
          text: "#f9fafb",       // Clean off-white text
          muted: "#9ca3af",      // Soft gray text for descriptions
        },
      },
    },
  },
  plugins: [],
}
