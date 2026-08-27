/** 사이트 구조.
 *
 * 공개 영역(로그인 전)과 업무 영역(로그인 후)을 나눈다. 업무 영역은 다시
 * 농가용·금융기관용 두 관점으로 갈린다 — 같은 엔진, 다른 화면.
 *
 * 원칙: **채울 수 없는 메뉴는 두지 않는다.**
 */
export type Item = { href: string; label: string; desc?: string };
export type Group = { label: string; items: Item[] };

/** 공개 포털 상단 메뉴 */
export const PORTAL: Group[] = [
  {
    label: "서비스 안내",
    items: [
      { href: "/about", label: "서비스 소개", desc: "왜 만들었나 — 상환 절벽 문제" },
      { href: "/about#how", label: "이용 방법", desc: "세 단계로 끝나는 진단" },
      { href: "/sitemap", label: "사이트맵", desc: "전체 메뉴 한눈에" },
    ],
  },
  {
    label: "제도 · 자료",
    items: [
      { href: "/policy", label: "제도 근거 검색", desc: "시행지침 원문에서 조항 찾기" },
      { href: "/library", label: "자료실", desc: "2026년 시행지침 원문" },
      { href: "/faq", label: "자주 묻는 질문", desc: "조항 인용이 붙는 답변" },
      { href: "/glossary", label: "용어사전", desc: "DSCR·거치기간·영업레버리지" },
    ],
  },
  {
    label: "데이터",
    items: [
      { href: "/crops", label: "작목 데이터", desc: "38작목 소득·변동성" },
      { href: "/market", label: "시세 · 국면", desc: "도매가 변동성" },
      { href: "/stats", label: "데이터 현황", desc: "출처와 갱신 시점" },
    ],
  },
  {
    label: "알림",
    items: [{ href: "/notice", label: "공지사항", desc: "서비스 변경 이력" }],
  },
];

/** 농가용 업무 메뉴 */
export const FARMER: Item[] = [
  { href: "/app", label: "홈", desc: "내 농가 요약" },
  { href: "/app/farm", label: "내 농가 정보", desc: "작목·면적·부채" },
  { href: "/app/revenue", label: "수익 전망", desc: "월별 현금흐름" },
  { href: "/app/safety", label: "금융 안전진단", desc: "스트레스 테스트" },
  { href: "/app/finance", label: "맞춤 금융지원", desc: "권장 차입 규모" },
  { href: "/app/relief", label: "구제제도", desc: "상환연기·회생자금" },
  { href: "/app/assistant", label: "AI 상담", desc: "계산과 조항을 함께" },
  { href: "/app/reports", label: "내 리포트", desc: "저장된 진단" },
];

/** 금융기관용 업무 메뉴 */
export const BANK: Item[] = [
  { href: "/bank", label: "심사 대시보드", desc: "신청 건 요약" },
  { href: "/bank/applicants", label: "차주 목록", desc: "신청 건 일괄 검토" },
  { href: "/bank/capacity", label: "상환능력 분석", desc: "계절성·변동성 반영" },
  { href: "/bank/design", label: "적정 여신 설계", desc: "권장 차입 역산" },
  { href: "/bank/stress", label: "여신 Stress Test", desc: "시나리오별 상환가능성" },
];

export const QUICK: Item[] = [
  { href: "/app/revenue", label: "수익 전망" },
  { href: "/app/safety", label: "안전진단" },
  { href: "/policy", label: "제도 근거" },
  { href: "/crops", label: "작목 데이터" },
];
