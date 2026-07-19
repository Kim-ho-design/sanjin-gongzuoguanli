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
          50: "#E9EEF9",
          100: "#D6E0F4",
          200: "#AEC2E8",
          300: "#7C9BDA",
          400: "#3D63C2",
          500: "#002FA7",
          600: "#002A94",
          700: "#00237C",
          800: "#001C64",
          900: "#00154B",
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
