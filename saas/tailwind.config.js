// saas/tailwind.config.js
import plugin from 'tailwindcss/plugin'

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./saas/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./saas/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Pre-existing — keep.
        background: "var(--background)",
        foreground: "var(--foreground)",
        // ── Linear-style design system tokens ──────────────────────────────
        // Solid, high-contrast, border-first. Dark base consistent with the
        // existing --bg-base. Enables bg-bg / bg-surface / border-border /
        // text-text / text-text-muted / bg-accent / bg-danger|success|warning.
        bg: "#0f1117",
        surface: "#161a23",
        surfaceElevated: "#1e2330",
        border: "#272c38",
        text: {
          DEFAULT: "#f2f3f5",
          muted: "#9096a2",
        },
        accent: "#ffc300",
        danger: "#ef4444",
        success: "#4ade80",
        warning: "#f59e0b",
      },
      fontSize: {
        // text-md is not a stock Tailwind size; the design system uses it.
        md: ["15px", { lineHeight: "1.5" }],
      },
    },
  },
  plugins: [
    plugin(function ({ addUtilities }) {
      // transition-fast / transition-normal as single utility classes,
      // per the design system's motion spec.
      addUtilities({
        ".transition-fast": { transition: "all 120ms cubic-bezier(0.4, 0, 0.2, 1)" },
        ".transition-normal": { transition: "all 200ms cubic-bezier(0.4, 0, 0.2, 1)" },
      })
    }),
  ],
}
