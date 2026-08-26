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

/** 제도상 신청 가능하지만 감당은 어려운 구간. */
export const unsafeGap = (d: Diagnosis): number =>
  Math.max(0, d.limits.available - d.limits.risk_based);
