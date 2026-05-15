/** @type {import('tailwindcss').Config} */
export default {
  content: [
    // Scans your original site files
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    // Scans your new saas folder files
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
