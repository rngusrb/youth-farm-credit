import { describe, expect, it } from "vitest";
import { headlineLimit, headlineScenario, unsafeGap } from "@/lib/diagnosis";
import type { Diagnosis } from "@/lib/api";

/** 실제 응답에서 뽑은 값 (딸기 수경 1,200평, 생활비 3,000만원).
 *  세 한도의 위기확률이 크게 갈리는 사례라 헷갈리면 바로 티가 난다. */
const s = (dscr: number, crisis: number) =>
  ({ dscr_median: dscr, crisis_prob: crisis }) as Diagnosis["scenarios"][string];

const d = {
  limits: { available: 500_000_000, recommended: 347_015_893, risk_based: 210_815_429 },
  scenarios: {
    at_available: s(0.88, 0.983),
    at_recommended: s(1.27, 0.649),
    at_risk_based: s(2.09, 0.1),
  },
} as unknown as Diagnosis;

describe("어느 한도를 '감당 가능' 이라 부르는가", () => {
  it("DSCR 기준(recommended)이 아니라 위험기준(risk_based)이다", () => {
    // recommended 는 소득이 안 흔들린다는 가정이라 위기확률이 64.9% 다.
    expect(headlineLimit(d)).toBe(210_815_429);
    expect(headlineLimit(d)).not.toBe(d.limits.recommended);
  });

  it("대표 시나리오의 위기확률은 감내 기준 수준이어야 한다", () => {
    expect(headlineScenario(d)!.crisis_prob).toBeLessThanOrEqual(0.1);
  });

  it("위험 구간은 제도한도와 위험기준한도의 차이다", () => {
    expect(unsafeGap(d)).toBe(500_000_000 - 210_815_429);
  });
});
