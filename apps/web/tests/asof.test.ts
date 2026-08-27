/**
 * 기준 시점 표시 (UX-009).
 *
 * 규칙: 화면은 **없는 날짜를 채우지 않는다**. 엔진이 준 시점만 쓰고,
 * 비어 있으면 아무것도 그리지 않는다 — 빈 자리를 오늘로 메우면 거짓이 된다.
 */
import { describe, expect, it } from "vitest";
import { asOfParts } from "../components/AsOf";

describe("asOfParts", () => {
  it("없는 시점은 만들어내지 않는다", () => {
    expect(asOfParts(undefined)).toEqual([]);
    expect(asOfParts({})).toEqual([]);
  });

  it("있는 것만 순서대로 낸다", () => {
    expect(
      asOfParts({
        income_survey_year: 2023,
        sigma_series: "2013~2024",
        market_window: ["2022-08-27", "2026-08-26"],
      }),
    ).toEqual([
      "소득조사 2023년",
      "변동성 2013~2024년 계열",
      "도매가 2022-08-27~2026-08-26",
    ]);
  });

  it("대출조건을 대조한 지침 연도를 자료실 원문 연도와 섞지 않는다", () => {
    // 자료실 원문은 2026년판, 대출조건(거치·상환·연기)을 쪽·인용까지 대조한 문서는 2025년판.
    expect(
      asOfParts({ guideline_year: 2025, guideline_checked_on: "2026-08-25" }),
    ).toEqual(["대출조건 2025년 지침 대조 2026-08-25"]);
  });

  it("작목마다 다른 조사연도를 그대로 반영한다", () => {
    expect(asOfParts({ income_survey_year: 2024, cost_survey_year: 2022 })).toEqual([
      "소득조사 2024년",
      "경영비 2022년",
    ]);
  });
});
