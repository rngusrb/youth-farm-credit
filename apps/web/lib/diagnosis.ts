import type { Diagnosis, Scenario } from "./api";

/** 세 한도 중 무엇이 "감당 가능한 금액"인가.
 *
 * 이걸 헷갈리면 화면이 위험한 금액을 안전하다고 말한다. 실제로 그랬다 —
 * 대시보드가 `limits.recommended` 를 '감당 가능한 차입' 으로 띄웠는데,
 * 그 금액의 2년연속 위기확률은 64.9% 였다.
 *
 *   available   제도 한도 (5억).            갚을 수 있는지와 무관하다.
 *   recommended DSCR 1.25 기준 (은행 관행). 소득이 **안 흔들린다는 가정**이다.
 *   risk_based  위기확률 ≤ 기준.            소득 변동을 넣고 시뮬레이션한 값. ← 이것이다.
 */
export const headlineLimit = (d: Diagnosis): number => d.limits.risk_based;

export const headlineScenario = (d: Diagnosis): Scenario | undefined =>
  d.scenarios.at_risk_based;

/** 제도상 신청 가능하지만 감당은 어려운 구간.
 *
 * **엔진이 내는 값을 그대로 쓴다.** 화면에서 빼면 해설(narrate)이 만든 문장과
 * 갈라지고, 수치 검증(llm/verify.py)에도 걸린다 — 실제로 걸렸다. */
export const unsafeGap = (d: Diagnosis): number => d.limits.unsafe_gap;

/** 변동 요인 이름. 작목 표와 리포트가 같은 말을 쓰도록 한 곳에 둔다. */
export const DRIVER_LABEL: Record<string, string> = {
  price: "가격",
  quantity: "수확량",
  cost: "경영비",
};

/**
 * σ 의 출처를 심사 화면의 세 갈래(입력/통계/가정)로 옮긴다 (UX-010).
 *
 * PARTIAL 을 "통계" 로 부르지 않는 것이 요점이다 — 시장 공통분만 실측이고
 * 농가 고유분은 가정값이다. 딸기는 분산의 63%가 가정이다.
 */
export function sigmaSourceKind(d: Diagnosis): "input" | "public" | "assumed" {
  if (d.sigma_source === "PERSONAL") return "input";
  if (d.sigma_source === "MEASURED") return "public";
  return "assumed";
}

export function sigmaSourceNote(d: Diagnosis): string {
  if (d.sigma_source === "PERSONAL") return "차주가 제출한 소득 이력으로 직접 계산했습니다.";
  if (d.sigma_source === "MEASURED") return "공표 통계 시계열로 실측했습니다.";
  const share = d.sigma_assumed_share;
  const pct = typeof share === "number" ? `분산 기준 ${Math.round(share * 100)}%가 가정입니다. ` : "";
  return `${pct}시장 공통 변동은 실측이고 농가 고유 변동은 가정값입니다. 차주 소득 이력을 받으면 가정이 사라집니다.`;
}
