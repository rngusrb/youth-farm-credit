import { describe, expect, it } from "vitest";
import { NAV } from "@/lib/nav";

describe("네비게이션", () => {
  it("빈 메뉴를 두지 않는다 — 모든 항목이 실제 라우트를 가리킨다", () => {
    for (const item of NAV) {
      expect(item.href).toMatch(/^\/[a-z]*$/);
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.desc.length).toBeGreaterThan(0);
    }
  });

  it("경로가 중복되지 않는다", () => {
    expect(new Set(NAV.map((n) => n.href)).size).toBe(NAV.length);
  });

  it("대시보드가 첫 항목이다", () => {
    expect(NAV[0].href).toBe("/");
  });
});
