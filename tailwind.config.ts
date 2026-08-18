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
        // Kimi 品牌色阶（v17 起，对齐官方品牌手册）：锚点 #007CFF，深锚 #002F5B
        kimi: {
          50: "#EAF4FF",
          100: "#D9EBFF",
          200: "#A0DAF7", // 手册浅蓝
          300: "#5BB8FF",
          400: "#00A1FF", // 手册亮蓝（高亮位）
          500: "#007CFF", // 手册核心品牌蓝
          600: "#0069DB",
          700: "#0053B8",
          800: "#003F8C",
          900: "#002F5B", // 手册深海军蓝（深锚）
        },
        ink: {
          DEFAULT: "#121212", // 手册近黑
          soft: "#707070",
          faint: "#8D9390",
        },
        // 语义辅助色（沿用 bean 命名，值向手册色板对齐）
        bean: {
          sky: "#00A1FF", // 手册亮蓝
          steel: "#0053B8", // 深蓝（= kimi-700）
          green: "#64C656", // 完成/成功（保留：手册荧光绿白字不可读）
          orange: "#E5983C", // 超期/反问/卡点（保留：手册无橙）
          sage: "#8D9390", // 手册中性灰
          lavender: "#DFC8F5", // 手册薰衣草
          teal: "#17343C", // 墨青（保留：深色位）
        },
        line: "#E1E3E6", // 手册中性灰描边
        panel: "#FFFFFF",
        card: "#F6F6F4", // 暖灰浅底
      },
      borderRadius: {
        panel: "16px",
        card: "10px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(18, 18, 18, 0.04), 0 4px 16px rgba(18, 18, 18, 0.06)",
        pop: "0 8px 30px rgba(18, 18, 18, 0.16)",
        btn: "0 2px 8px rgba(0, 124, 255, 0.35)",
      },
      fontFamily: {
        sans: ["HarmonyOS Sans SC", "PingFang SC", "Microsoft YaHei", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
