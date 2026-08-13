import type { Config } from "tailwindcss";

/**
 * Colours resolve through CSS variables so a single class works in both
 * themes. `text-ink-900` is near-black in light mode and near-white in dark;
 * `bg-surface` is a white card or a raised dark panel. No `dark:` variant is
 * needed for the ninety percent of the UI built from these tokens.
 */
const withVar = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Page background, cards, and the colour that sits ON a dark button.
        canvas: withVar("--canvas"),
        surface: withVar("--surface"),
        "surface-raised": withVar("--surface-raised"),

        brand: {
          50: withVar("--brand-50"),
          100: withVar("--brand-100"),
          200: "#d9ceff",
          300: "#bda6ff",
          400: "#9c74ff",
          500: "#7c47f5",
          600: withVar("--brand-600"),
          700: "#5b21b6",
          800: "#4c1d95",
          900: "#3b1580",
        },

        ink: {
          50: withVar("--ink-50"),
          100: withVar("--ink-100"),
          200: withVar("--ink-200"),
          300: withVar("--ink-300"),
          400: withVar("--ink-400"),
          500: withVar("--ink-500"),
          600: withVar("--ink-600"),
          700: withVar("--ink-700"),
          800: withVar("--ink-800"),
          900: withVar("--ink-900"),
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "Segoe UI", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(var(--shadow) / 0.04), 0 1px 3px 0 rgb(var(--shadow) / 0.04)",
        pop: "0 12px 32px -8px rgb(var(--shadow) / 0.18)",
      },
      borderRadius: {
        xl: "12px",
        "2xl": "16px",
      },
    },
  },
  plugins: [],
};

export default config;
