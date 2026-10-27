import type { Config } from "tailwindcss";

// Soaring Fountain Group of Schools — design tokens
// Brand direction: sleek, academic, elegant. A deep accent color against
// warm ivory, with quiet neutrals doing most of the work so the accent
// stays meaningful (primary actions, active states, alerts) rather than
// decorative.
//
// `crimson` (despite the name, kept for backwards compatibility with the
// ~30 files already using `bg-crimson-600` etc.) is defined via CSS
// custom properties rather than fixed hex values, so it can be swapped at
// runtime — see lib/themes.ts and app/layout.tsx. `cream` stays a plain
// fixed color on purpose: page/surface backgrounds don't change with the
// theme (see lib/themes.ts's file comment for why).

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./pages/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        crimson: {
          DEFAULT: "rgb(var(--color-crimson-600) / <alpha-value>)",
          50: "rgb(var(--color-crimson-50) / <alpha-value>)",
          100: "rgb(var(--color-crimson-100) / <alpha-value>)",
          200: "rgb(var(--color-crimson-200) / <alpha-value>)",
          300: "rgb(var(--color-crimson-300) / <alpha-value>)",
          400: "rgb(var(--color-crimson-400) / <alpha-value>)",
          500: "rgb(var(--color-crimson-500) / <alpha-value>)",
          600: "rgb(var(--color-crimson-600) / <alpha-value>)", // brand primary
          700: "rgb(var(--color-crimson-700) / <alpha-value>)",
          800: "rgb(var(--color-crimson-800) / <alpha-value>)",
          900: "rgb(var(--color-crimson-900) / <alpha-value>)",
        },
        // Label/icon color to use on top of a crimson-600 (or 700, for
        // hover) fill — automatically white or near-black, whichever
        // actually contrasts against the currently chosen accent color.
        // See lib/themes.ts's getOnAccentColor(). Every button/badge that
        // sits on a crimson background uses this instead of a hardcoded
        // `text-white`.
        "on-crimson": "rgb(var(--color-on-crimson) / <alpha-value>)",
        cream: {
          // The school's SECONDARY color (page surface). 100 and DEFAULT follow
          // each school's chosen color via --color-secondary-rgb (see
          // lib/schoolBranding.ts); the default is the original cream.
          DEFAULT: "rgb(var(--color-secondary-rgb) / <alpha-value>)",
          50: "#FFFDF6",
          100: "rgb(var(--color-secondary-rgb) / <alpha-value>)",
          200: "#FFF0AD",
        },
        ink: "#1A1A1A",
        surface: {
          DEFAULT: "#FFFFFF",
          subtle: "#F8F9FA",
        },
        // semantic aliases — reference these in components, not raw hexes,
        // so the palette can be retuned once from a single place
        primary: "rgb(var(--color-crimson-600) / <alpha-value>)",
        "primary-hover": "rgb(var(--color-crimson-700) / <alpha-value>)",
        "on-primary": "#FFFFFF",
        background: "rgb(var(--color-secondary-rgb) / <alpha-value>)",
        "background-muted": "#F8F9FA",
        foreground: "#1A1A1A",
        success: "#1E7B4D",
        warning: "#B8860B",
        danger: "rgb(var(--color-crimson-600) / <alpha-value>)",
      },
      fontFamily: {
        // display: headings, exam titles, report card headers
        display: ["var(--font-plus-jakarta)", "Plus Jakarta Sans", "sans-serif"],
        // body: everything else — optimized for long reading (exam text)
        sans: ["var(--font-inter)", "Inter", "sans-serif"],
      },
      borderRadius: {
        sm: "8px",
        DEFAULT: "10px",
        lg: "12px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(26,26,26,0.04), 0 4px 12px rgba(26,26,26,0.06)",
        "card-hover": "0 2px 4px rgba(26,26,26,0.06), 0 8px 24px rgba(26,26,26,0.10)",
        focus: "0 0 0 3px rgb(var(--color-crimson-600) / 0.25)",
      },
      transitionDuration: {
        DEFAULT: "200ms",
      },
      transitionTimingFunction: {
        DEFAULT: "ease",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-warn": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      animation: {
        "fade-in": "fade-in 200ms ease-out",
        "pulse-warn": "pulse-warn 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
