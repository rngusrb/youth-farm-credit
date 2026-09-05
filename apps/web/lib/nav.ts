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
      { href: "/policy", label: "지원 제도 찾아보기", desc: "시행지침 원문에서 조항 찾기" },
      { href: "/library", label: "자료실", desc: "2026년 시행지침 원문" },
      { href: "/faq", label: "자주 묻는 질문", desc: "조항 인용이 붙는 답변" },
      { href: "/glossary", label: "용어사전", desc: "은행에서 쓰는 말 풀이" },
    ],
  },
  {
    label: "데이터",
    items: [
      { href: "/crops", label: "작목 데이터", desc: "38작목 소득·변동성" },
      { href: "/market", label: "가격과 시장 흐름", desc: "도매가 변동성" },
      { href: "/stats", label: "데이터 현황", desc: "출처와 갱신 시점" },
    ],
  },
  {
    label: "알림",
    items: [{ href: "/notice", label: "공지사항", desc: "서비스 변경 이력" }],
  },
];

/** 농가용 업무 메뉴 — 명세의 5단계가 그대로 메뉴다.
 *
 * 2026-09-02 이전에는 메뉴가 10개 평평하게 놓여 있었다. 기능은 다 있었는데
 * **핵심 기능인 자금지도가 "수익 전망" 안 세 번째 섹션에 묻혀 있었고**,
 * 건강검진이 "맞춤 처방" 안에 있었다. 순서를 봐도 무엇부터 해야 하는지 안 보였다.
 *
 * 그래서 다섯 단계를 앞에 두고 나머지는 "자세히 보기"로 내렸다.
 * **지우지 않았다** — 여섯 개 다 채워져 있는 화면이다.
 */
export const FARMER_STEPS: Item[] = [
  { href: "/app/farm", label: "내 농장정보 입력", desc: "현재 농장과 올해 계획" },
  { href: "/app/checkup", label: "AI 농가 건강검진", desc: "같은 작물 평균과 비교" },
  { href: "/app/map", label: "AI 농사 자금지도", desc: "월별 돈과 부족할 시점" },
  { href: "/app/assistant", label: "AI 농가 상담사", desc: "묻고 시뮬레이션하기" },
  { href: "/app/prescribe", label: "AI 맞춤 처방", desc: "지원 제도·신청서·작물 바꾸기" },
];

/** 단계 안에서 더 파고들 때 쓰는 화면들. 메뉴 아래쪽에 접어 둔다. */
export const FARMER_DETAIL: Item[] = [
  { href: "/app/revenue", label: "농사 수입과 지출", desc: "한 해 돈 정리와 월별 돈 내역" },
  { href: "/app/safety", label: "금융 안전진단", desc: "값이 떨어지면 어떻게 되나" },
  { href: "/app/finance", label: "맞춤 금융지원", desc: "권장 대출금" },
  { href: "/app/levers", label: "얼마까지 받으려면", desc: "무엇을 바꾸면 되는지" },
  { href: "/app/relief", label: "어려울 때 받을 도움", desc: "갚는 날 미루기·다시 시작하기" },
  { href: "/app/reports", label: "내 리포트", desc: "저장된 진단" },
];

/** 기존 소비자(WorkChrome 등)가 쓰는 평평한 목록. 홈이 맨 앞. */
export const FARMER: Item[] = [
  { href: "/app", label: "홈", desc: "내 농가 요약" },
  ...FARMER_STEPS,
  ...FARMER_DETAIL,
];

/** 금융기관용 업무 메뉴 */
export const BANK: Item[] = [
  { href: "/bank", label: "심사 대시보드", desc: "신청 건 요약" },
  { href: "/bank/applicants", label: "대출 신청자 목록", desc: "신청 건 일괄 검토" },
  { href: "/bank/capacity", label: "대출 갚을 능력 살펴보기", desc: "계절성·변동성 반영" },
  { href: "/bank/design", label: "대출 금액 계획", desc: "권장 대출금 역산" },
  { href: "/bank/stress", label: "대출 위험 점검", desc: "상황별로 대출을 갚을 수 있는지" },
];

export const QUICK: Item[] = [
  { href: "/app/checkup", label: "건강검진" },
  { href: "/app/map", label: "자금지도" },
  { href: "/app/assistant", label: "AI 상담사" },
  { href: "/app/prescribe", label: "맞춤 처방" },
  { href: "/policy", label: "제도 근거" },
  { href: "/crops", label: "작목 데이터" },
];
