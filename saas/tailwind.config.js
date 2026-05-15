// saas/tailwind.config.js

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    // Since this config lives inside the saas directory, target everything relative to it
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    // Absolute path fallbacks in case Vercel initializes from the workspace root
    "./saas/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./saas/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
    },
  },
  plugins: [],
};
