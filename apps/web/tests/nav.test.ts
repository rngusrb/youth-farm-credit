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

  it("각 업무 메뉴의 첫 항목이 그 영역의 홈이다", () => {
    expect(FARMER[0].href).toBe("/app");
    expect(BANK[0].href).toBe("/bank");
  });
});
