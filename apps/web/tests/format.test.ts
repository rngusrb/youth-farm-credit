import { describe, expect, it } from "vitest";
import { pct, pyeong, ratio, won } from "@/lib/format";

describe("표시 규칙", () => {
  it("금액은 억·만원으로 끊는다", () => {
    expect(won(500_000_000)).toBe("5억원");
    expect(won(123_450_000)).toBe("1억 2,345만원");
    expect(won(0)).toBe("0원");
  });

  it("음수도 부호를 잃지 않는다", () => {
    expect(won(-30_000_000)).toBe("-3,000만원");
  });

  it("확률은 소수점 1자리", () => {
    expect(pct(0.1)).toBe("10.0%");
    expect(pct(0.0834)).toBe("8.3%");
  });

  it("배수는 소수점 2자리 — DSCR 1.25 기준선과 눈으로 비교돼야 한다", () => {
    expect(ratio(1.2)).toBe("1.20");
  });

  it("평수는 3자리 구분", () => {
    expect(pyeong(3025)).toBe("3,025평");
  });
});
