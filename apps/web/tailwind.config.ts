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
          ink3:   "#636a73",  // 5.47:1 (흰 배경) — #7b838d 는 3.84:1 로 AA 미달이었다
          point:  "#c8102e",  // 경고·필수 표시
          ok:     "#0f7b6c",
          warn:   "#9c5512",  // 5.64:1 — #b5651d 는 4.34:1 로 AA 미달이었다
        },
        // 리포트 전용 종이 색계 (건드리지 말 것)
        paper: {
          bg:"#faf8f4", panel:"#ffffff", sunk:"#f2efe8", rule:"#e4dfd5", soft:"#efebe3",
          ink:"#14181f", ink2:"#525a68", ink3:"#61666e",  // 가장 어두운 종이 배경(soft)에서도 4.86:1. #8a8f99 는 3.06:1 이었다
          accent:"#8a5713", accentbg:"#f6eddd",  // accent: 배지 배경 위 5.23:1 — #9a6216 은 4.37:1 이었다
          danger:"#a8442b", dangerbg:"#f7e6e1", ok:"#29685a", okbg:"#e2ece8",
        },
      },
      // 정부 포털의 신뢰감은 색계와 정보 구조가 만든다. 각진 모서리가 만드는 게 아니다.
      // 2px 은 지나치게 경직돼서 8px 대로 올렸다 — 완전히 둥글게 가지는 않는다.
      borderRadius: { DEFAULT: "6px", sm: "4px", md: "8px", lg: "10px", xl: "14px" },
      transitionTimingFunction: {
        // 감속 곡선. 눌렀을 때 '따라붙는' 느낌을 만든다.
        out: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: { "fade-up": "fade-up 260ms cubic-bezier(0.16,1,0.3,1) both" },
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
