/** 대시보드 네비게이션.
 *
 * 원칙 하나: **채울 수 없는 메뉴는 두지 않는다.** 클릭하면 "준비중"이 뜨는
 * 항목이 데모에서 제일 먼저 들킨다. 목업에 있던 '기상 위험 알림'과 '보험 관리'는
 * 우리가 가진 데이터로 만들 수 없어서 뺐다 (기상 관측 자료 없음, 보험료율 미공개).
 */
export type NavItem = {
  href: string;
  label: string;
  desc: string;
  icon: string;
};

export const NAV: NavItem[] = [
  { href: "/",           label: "대시보드",   desc: "한눈에 보기",              icon: "grid" },
  { href: "/diagnose",   label: "위험 진단",  desc: "감당 가능한 차입 규모",     icon: "gauge" },
  { href: "/reports",    label: "내 리포트",  desc: "이 브라우저에 저장된 진단",  icon: "doc" },
  { href: "/farm",       label: "내 농가",    desc: "소득 이력으로 σ 개인화",     icon: "sprout" },
  { href: "/crops",      label: "작목 데이터", desc: "38작목 변동성과 근거",      icon: "table" },
  { href: "/market",     label: "시세·국면",  desc: "KAMIS 도매가와 변동성",     icon: "chart" },
  { href: "/policy",     label: "제도 근거",  desc: "시행지침 원문 검색",         icon: "book" },
  { href: "/assistant",  label: "AI 상담",    desc: "계산과 조항을 함께",         icon: "chat" },
];
