import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        kimi: {
          50: "#EEF2FF",
          100: "#E0E7FF",
          200: "#C7D2FE",
          300: "#A5B4FC",
          400: "#6B93FF",
          500: "#4D6BFE",
          600: "#3D5BF0",
          700: "#3545C0",
          800: "#2E3A99",
          900: "#252F6E",
        },
        ink: {
          DEFAULT: "#1A1D2E",
          soft: "#5A6280",
          faint: "#9AA3C0",
        },
        line: "#E3E9FB",
        panel: "#FFFFFF",
        card: "#F7F9FF",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
