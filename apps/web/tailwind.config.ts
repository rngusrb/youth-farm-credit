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
          // 출처 배지용 옅은 배경 + 그 위에서 AA 를 넘는 전경.
          // 규칙: 전경색은 **그 색이 앉을 가장 어두운 배경**에서 재고 고른다.
          okbg:   "#e4efec",  // 위에 ok2(#0c6a5d) 5.52:1  (ok 는 4.39:1 로 미달)
          ok2:    "#0c6a5d",
          warnbg: "#f5ebdf",  // 위에 warn2(#8f4d10) 5.51:1
          warn2:  "#8f4d10",
        },
        // 리포트 전용 종이 색계 (건드리지 말 것)
        paper: {
          bg:"#faf8f4", panel:"#ffffff", sunk:"#f2efe8", rule:"#e4dfd5", soft:"#efebe3",
          ink:"#14181f", ink2:"#525a68", ink3:"#61666e",  // 가장 어두운 종이 배경(soft)에서도 4.86:1. #8a8f99 는 3.06:1 이었다
          accent:"#8a5713", accentbg:"#f6eddd",  // accent: 배지 배경 위 5.23:1 — #9a6216 은 4.37:1 이었다
          danger:"#a8442b", dangerbg:"#f7e6e1", ok:"#29685a", okbg:"#e2ece8",
        },
      },
      // 정부 포털의 신뢰감(색계·정보구조·표) + 토스의 읽기 편함(여백·반경·전이).
      // 표는 각지게 두고 카드·버튼만 둥글린다.
      borderRadius: { DEFAULT: "8px", sm: "6px", md: "10px", lg: "14px", xl: "18px" },
      boxShadow: {
        // 아주 옅게. 그림자로 위계를 만들지 않는다 — 위계는 여백과 크기가 만든다.
        card: "0 1px 2px rgb(13 43 82 / 0.04), 0 4px 12px -6px rgb(13 43 82 / 0.08)",
        lift: "0 2px 4px rgb(13 43 82 / 0.05), 0 12px 24px -10px rgb(13 43 82 / 0.14)",
      },
      fontSize: {
        // 핵심 숫자용. 한 화면에 하나만 쓴다.
        hero: ["2.6rem", { lineHeight: "1.05", letterSpacing: "-0.03em", fontWeight: "800" }],
        figure: ["1.9rem", { lineHeight: "1.1", letterSpacing: "-0.025em", fontWeight: "700" }],
      },
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
