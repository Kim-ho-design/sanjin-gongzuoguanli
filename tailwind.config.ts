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
        // 拼豆配色（v10 起）：锚点 C07 #305FB9，宝蓝 C08 #1839A8 作深阶
        kimi: {
          50: "#EEF3FB",
          100: "#DCE7F7",
          200: "#C0D2F0",
          300: "#93B1E3",
          400: "#5E85CE",
          500: "#305FB9",
          600: "#29519F",
          700: "#1839A8",
          800: "#16307E",
          900: "#12245C",
        },
        ink: {
          DEFAULT: "#191110", // H16 棕黑
          soft: "#57504A",
          faint: "#948C83",
        },
        // 拼豆辅助色（色号即拼豆用料编号）
        bean: {
          sky: "#5996D9", // C06 天蓝
          steel: "#5098BF", // C26 钢青
          green: "#64C656", // B05 亮绿（完成/成功）
          orange: "#E5983C", // P17 橙（超期/反问/卡点等"注意"语义）
          sage: "#AFB5A8", // M01 鼠尾草灰
          lavender: "#D1CDDC", // D16 浅薰衣草
          teal: "#17343C", // B22 墨青
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
