/**
 * 자격 자가진단은 **판정하지 않는다** (UX-012).
 *
 * 자격을 잘못 판정하면 실제로는 받을 수 있는 사람이 포기한다. 그래서 화면이 낼 수
 * 있는 말은 정해져 있다 — "해당하지 않을 수 있어요" 까지고, "자격 없음" 은 안 된다.
 * 답하지 않은 요건에 대해서는 아무 의견도 내지 않는다.
 */
import { describe, expect, it } from "vitest";
import { verdictFor } from "../components/EligibilityCheck";
import type { Requirement } from "../lib/api";

const base: Requirement = {
  key: "age", label: "나이", check: "age_range", min: 18, max: 49,
  document: "2026년 후계농업경영인 육성사업 시행지침", section: "Ⅱ-1-가",
  quote: "가. 연령 : 사업 시행연도 기준 18세～49세(1976~2008년도 출생자)",
  quote_truncated: false, source_url: null,
};
const blank = { age: "", career: "", self: null } as const;

describe("자격 의견", () => {
  it("답하지 않으면 아무 의견도 내지 않는다", () => {
    expect(verdictFor(base, blank).tone).toBe("none");
    expect(verdictFor({ ...base, check: "self" }, blank).tone).toBe("none");
  });

  it("0 을 '안 답함' 과 구분한다 — 경력 0년은 실제 답이다", () => {
    const career: Requirement = { ...base, key: "career", check: "career_max", min: null, max: 10 };
    expect(verdictFor(career, { ...blank, career: "" }).tone).toBe("none");
    expect(verdictFor(career, { ...blank, career: "0" }).tone).toBe("ok");
  });

  it("범위 안이면 ok, 밖이면 warn", () => {
    expect(verdictFor(base, { ...blank, age: "30" }).tone).toBe("ok");
    expect(verdictFor(base, { ...blank, age: "17" }).tone).toBe("warn");
    expect(verdictFor(base, { ...blank, age: "50" }).tone).toBe("warn");
    expect(verdictFor(base, { ...blank, age: "49" }).tone).toBe("ok");
  });

  it("경력 상한은 미만이다 — 10년은 넘는 것으로 본다", () => {
    const career: Requirement = { ...base, key: "career", check: "career_max", min: null, max: 10 };
    expect(verdictFor(career, { ...blank, career: "9" }).tone).toBe("ok");
    expect(verdictFor(career, { ...blank, career: "10" }).tone).toBe("warn");
  });

  it("단정하지 않는다 — 어떤 답에도 '자격 없음' 류가 나오지 않는다", () => {
    const 금지 = ["자격 없음", "신청 불가", "해당하지 않습니다", "대상 아님", "탈락"];
    const cases = [
      verdictFor(base, { ...blank, age: "70" }),
      verdictFor(base, { ...blank, age: "30" }),
      verdictFor({ ...base, check: "self" }, { ...blank, self: "no" }),
      verdictFor({ ...base, check: "self" }, { ...blank, self: "yes" }),
      verdictFor(base, blank),
    ];
    for (const v of cases) {
      for (const bad of 금지) expect(v.text, v.text).not.toContain(bad);
    }
  });

  it("비해당 의견에는 근거 조항 번호가 붙는다", () => {
    expect(verdictFor(base, { ...blank, age: "70" }).text).toContain("Ⅱ-1-가");
    expect(verdictFor({ ...base, check: "self" }, { ...blank, self: "no" }).text).toContain("Ⅱ-1-가");
  });
});
