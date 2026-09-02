import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        marca: {
          50: "#eef7f1",
          100: "#d5ecdd",
          500: "#2f8f5b",
          600: "#25774a",
          700: "#1c5c39",
          900: "#0f3421",
        },
      },
    },
  },
  plugins: [],
};

export default config;
