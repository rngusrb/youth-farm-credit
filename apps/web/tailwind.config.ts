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
        // 리포트 = 어두운 앱 위에 놓인 종이. 앱 크롬과 다른 색계를 쓴다.
        paper: {
          bg:    "#faf8f4",
          panel: "#ffffff",
          sunk:  "#f2efe8",
          rule:  "#e4dfd5",
          soft:  "#efebe3",
          ink:   "#14181f",
          ink2:  "#525a68",
          ink3:  "#8a8f99",
          accent:"#9a6216",
          accentbg:"#f6eddd",
          danger:"#a8442b",
          dangerbg:"#f7e6e1",
          ok:    "#29685a",
          okbg:  "#e2ece8",
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
        serif: [
          "var(--font-serif)",
          "Noto Serif KR",
          "Apple SD Gothic Neo",
          "serif",
        ],
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
