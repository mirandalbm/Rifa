import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}", "./shared/**/*.ts"],
  theme: {
    extend: {
      colors: {
        // Com o `<alpha-value>`, `bg-white/95` funciona sobre a variável do tema
        // (sem ele o Tailwind não aplica a opacidade e a cor some).
        white: "color-mix(in srgb, var(--white) calc(<alpha-value> * 100%), transparent)",
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
        "on-yellow": "var(--on-yellow)",
        /** Branco que não muda com o tema: texto sobre foto e banner escuro. */
        branco: "#ffffff",
        /** Cor de marca do template: logo, links, destaque de navegação. */
        marca: "var(--marca)",
        /** O "+" do carrinho na barra da publicação. */
        azul: "var(--azul)",
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ['var(--fonte, "Instrument Sans")', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"DM Mono"', "ui-monospace", "monospace"],
        /** Comentários no tamanho e na fonte do Instagram (a do sistema do aparelho). */
        instagram: ["-apple-system", "BlinkMacSystemFont", '"Segoe UI"', "Roboto", "Helvetica", "Arial", "sans-serif"],
      },
      // Os cantos seguem o template (`--raio`, padrão 9px): reto, suave ou redondo.
      borderRadius: {
        xl: "calc(var(--raio, 9px) + 5px)",
        lg: "calc(var(--raio, 9px) + 2px)",
        md: "var(--raio, 9px)",
        sm: "max(calc(var(--raio, 9px) - 2px), 0px)",
      },
      boxShadow: {
        card: "0 1px 2px rgba(11,31,20,.05), 0 12px 28px -18px rgba(11,31,20,.25)",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
