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
          200: "#CEDDFD",
          300: "#9EC0FB",
          400: "#6EA1F8",
          500: "#3E81F6",
          600: "#3772D8",
          700: "#2B5AAC",
          800: "#224787",
          900: "#193462",
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
