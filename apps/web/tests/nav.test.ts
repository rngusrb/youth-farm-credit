import { describe, expect, it } from "vitest";
import { BANK, FARMER, PORTAL, QUICK } from "@/lib/nav";

const all = [...PORTAL.flatMap((g) => g.items), ...FARMER, ...BANK, ...QUICK];

describe("사이트 구조", () => {
  it("모든 메뉴가 실제 경로를 가리킨다 — 빈 메뉴를 두지 않는다", () => {
    for (const i of all) {
      expect(i.href.startsWith("/")).toBe(true);
      expect(i.label.length).toBeGreaterThan(0);
    }
  });

  it("업무 메뉴 경로가 중복되지 않는다", () => {
    for (const menu of [FARMER, BANK]) {
      expect(new Set(menu.map((i) => i.href)).size).toBe(menu.length);
    }
  });

  it("농가용과 금융기관용은 서로 다른 뿌리를 쓴다", () => {
    expect(FARMER.every((i) => i.href.startsWith("/app"))).toBe(true);
    expect(BANK.every((i) => i.href.startsWith("/bank"))).toBe(true);
  });

  it("농가 메뉴의 첫 항목은 그 영역의 홈이다", () => {
    expect(FARMER[0].href).toBe("/app");
  });

  it("금융기관 메뉴는 **차주 목록**으로 시작한다", () => {
    // 2026-09-07 규칙을 바꿨다. 예전에는 "첫 항목 = 그 영역의 홈" 이었는데,
    // 심사 화면 셋(capacity·design·stress)이 전부 "고른 차주" 를 보게 되면서
    // **차주를 고르는 것이 시작점**이 됐다. 대시보드를 먼저 두면 차주를 안 고른 채
    // 분석 화면에 들어가 "이 화면이 누구 걸 보여주나" 가 된다.
    expect(BANK[0].href).toBe("/bank/applicants");
    expect(BANK.some((i) => i.href === "/bank")).toBe(true);   // 대시보드는 남아 있다
  });
});
