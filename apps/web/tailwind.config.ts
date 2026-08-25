import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0a0e16",
          900: "#111726",
          800: "#1a2233",
          700: "#252f44",
          600: "#3a465f",
        },
        signal: {
          // 금융 도구 톤 — 초록 계열은 첫 화면에서 쓰지 않는다 (§7.3)
          warn: "#f0a92c",
          danger: "#e2564d",
          calm: "#5b8def",
          ok: "#2fa9a0",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Pretendard",
          "Apple SD Gothic Neo",
          "Malgun Gothic",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
