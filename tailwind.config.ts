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
          50: "#EEF4FE",
          100: "#DFEAFD",
          200: "#BDD4FB",
          300: "#92B5F9",
          400: "#6191F7",
          500: "#3375F6",
          600: "#245FE0",
          700: "#1F4DB8",
          800: "#1E4093",
          900: "#1D3878",
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
        sans: ["HarmonyOS Sans SC", "PingFang SC", "Microsoft YaHei", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
