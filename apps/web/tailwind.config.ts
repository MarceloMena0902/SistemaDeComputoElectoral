import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "electoral-blue": "#0066CC",
        "electoral-gold": "#FFD700",
      },
    },
  },
  plugins: [],
} satisfies Config;
