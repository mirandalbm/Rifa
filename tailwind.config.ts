import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        white: "var(--white)",
        mist: { DEFAULT: "var(--mist)", 2: "var(--mist-2)" },
        ink: { DEFAULT: "var(--ink)", 2: "var(--ink-2)" },
        muted: "var(--muted)",
        line: { DEFAULT: "var(--line)", 2: "var(--line-2)" },
        green: {
          DEFAULT: "var(--green)",
          deep: "var(--green-deep)",
          bright: "var(--green-bright)",
          soft: "var(--green-soft)",
        },
        yellow: {
          DEFAULT: "var(--yellow)",
          deep: "var(--yellow-deep)",
          soft: "var(--yellow-soft)",
        },
        red: { DEFAULT: "var(--red)", soft: "var(--red-soft)" },
        "on-green": "var(--on-green)",
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ['"Instrument Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"DM Mono"', "ui-monospace", "monospace"],
      },
      borderRadius: { xl: "14px", lg: "11px", md: "9px", sm: "7px" },
      boxShadow: {
        card: "0 1px 2px rgba(11,31,20,.05), 0 12px 28px -18px rgba(11,31,20,.25)",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
