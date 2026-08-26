import type { Config } from "tailwindcss";

/** 정부 포털 톤.
 *
 * 흰 바탕, 네이비 계열, 각진 모서리, 표 중심. 다크 대시보드에서 갈아탔다.
 * 리포트(.sheet)의 종이 색계는 그대로 둔다 — 그건 인쇄물이다.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        gov: {
          navy:   "#0d2b52",  // 최상단 유틸바·푸터
          head:   "#14477e",  // 헤더·주요 버튼
          link:   "#1f66b5",  // 링크·활성
          soft:   "#eaf1f9",  // 활성 배경
          bg:     "#f4f6f9",  // 페이지 바탕
          panel:  "#ffffff",
          sunk:   "#f7f9fb",  // 표 머리·보조 영역
          line:   "#d7dde5",
          line2:  "#e8ecf1",
          ink:    "#191d23",
          ink2:   "#4c545e",
          ink3:   "#7b838d",
          point:  "#c8102e",  // 경고·필수 표시
          ok:     "#0f7b6c",
          warn:   "#b5651d",
        },
        // 리포트 전용 종이 색계 (건드리지 말 것)
        paper: {
          bg:"#faf8f4", panel:"#ffffff", sunk:"#f2efe8", rule:"#e4dfd5", soft:"#efebe3",
          ink:"#14181f", ink2:"#525a68", ink3:"#8a8f99",
          accent:"#9a6216", accentbg:"#f6eddd",
          danger:"#a8442b", dangerbg:"#f7e6e1", ok:"#29685a", okbg:"#e2ece8",
        },
      },
      borderRadius: { DEFAULT: "2px", md: "3px", lg: "4px", xl: "6px" },
      fontFamily: {
        sans: ["Pretendard", "-apple-system", "BlinkMacSystemFont",
               "Apple SD Gothic Neo", "Malgun Gothic", "sans-serif"],
        serif: ["var(--font-serif)", "Noto Serif KR", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
