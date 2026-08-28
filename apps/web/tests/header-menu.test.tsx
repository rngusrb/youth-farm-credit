/**
 * 상단 메뉴는 **한 번에 하나만** 열린다.
 *
 * 사고 이력(2026-08-28): `group-hover` 또는 `group-focus-within` 으로 열었더니,
 * 버튼을 클릭해 포커스가 남은 상태에서 다른 메뉴에 마우스를 올리면 **둘이 동시에
 * 떠서 겹쳤다.** 게다가 그 버튼에는 클릭 핸들러가 없어 눌러도 아무 일이 없었다.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(
  join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "components/gov/Header.tsx"),
  "utf8",
);

describe("상단 메뉴", () => {
  it("CSS 만으로 열지 않는다 — group-hover/focus-within 조합이 겹침을 만들었다", () => {
    expect(SRC).not.toContain("group-hover:visible");
    expect(SRC).not.toContain("group-focus-within:visible");
  });

  it("열린 메뉴를 상태 **하나**로 관리한다 — 그래야 둘이 못 뜬다", () => {
    expect(SRC).toContain("useState<string | null>(null)");
    // 열림 여부는 그 하나의 상태와 비교해서만 정한다
    expect(SRC).toContain("hidden={open !== g.label}");
  });

  it("버튼이 실제로 동작한다", () => {
    expect(SRC).toContain("onClick={() => setOpen(g.label)}");
    expect(SRC).toContain('type="button"');
  });

  it("닫는 길이 있다 — Escape · 바깥 클릭 · 마우스 이탈 · 페이지 이동", () => {
    expect(SRC).toContain('e.key === "Escape"');
    expect(SRC).toContain('addEventListener("mousedown"');
    expect(SRC).toContain("onMouseLeave={close}");
    expect(SRC).toContain("}, [path, close]);");
  });

  it("스크린리더가 열림 상태를 안다", () => {
    expect(SRC).toContain("aria-expanded={open === g.label}");
    expect(SRC).toContain("aria-controls=");
  });
});
