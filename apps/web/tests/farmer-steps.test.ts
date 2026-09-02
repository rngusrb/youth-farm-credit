import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { FARMER, FARMER_DETAIL, FARMER_STEPS } from "@/lib/nav";

/** 5단계 메뉴가 화면과 어긋나지 않는다.
 *
 * 사고 이력 2026-09-02: 메뉴를 명세의 5단계로 재편했는데 **화면 제목은 옛 이름이
 * 그대로였다** — 메뉴는 "AI 농가 상담사", 화면은 "AI 상담". 농가가 메뉴를 누르고
 * 들어가면 다른 이름이 나온다. 이름은 두 곳에 있으면 반드시 갈라진다.
 */
// process.cwd() 를 쓰지 않는다 — 하네스는 저장소 루트에서 vitest 를 부르고
// 개발자는 apps/web 에서 부른다. 실행 위치에 따라 통과가 갈리면 검사가 아니다.
// (2026-09-02 실제로 그렇게 됐다: 직접 돌리면 80개 통과, 하네스에선 1개 실패)
const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "app", "app");

const read = (href: string) =>
  readFileSync(join(APP, href.replace("/app/", ""), "page.tsx"), "utf8");

describe("농가용 5단계", () => {
  it("단계는 다섯 개다", () => {
    expect(FARMER_STEPS).toHaveLength(5);
  });

  it("각 단계 화면의 제목이 메뉴 이름과 같다", () => {
    for (const step of FARMER_STEPS) {
      const src = read(step.href);
      expect(src, `${step.href} 에 "${step.label}" 제목이 없다`)
        .toContain(`title="${step.label}"`);
    }
  });

  it("평평한 FARMER 목록이 홈 + 5단계 + 자세히보기 로 이뤄진다", () => {
    expect(FARMER[0].href).toBe("/app");
    expect(FARMER.slice(1, 6)).toEqual(FARMER_STEPS);
    expect(FARMER.slice(6)).toEqual(FARMER_DETAIL);
  });

  it("메뉴에 중복 경로가 없다", () => {
    const hrefs = FARMER.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
