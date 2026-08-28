/**
 * 「왜 이 조건인가」 는 추천하지 않는다 (UX-014).
 *
 * 이 서비스는 대출 알선·상품 추천을 하지 않는다고 선언했다 (CLAUDE.md).
 * 어느 쪽이 유리하다는 판정도 하지 않는다 (화법 규칙 2).
 * 할 수 있는 것은 조건과 숫자를 나란히 놓는 것뿐이다.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(
  join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "components/WhyThisLoan.tsx"),
  "utf8",
);
/** 주석은 규칙을 설명하느라 금지어를 쓴다. 화면에 나가는 문자열만 본다. */
const BODY = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("WhyThisLoan", () => {
  it("추천·판정 문구를 쓰지 않는다", () => {
    for (const bad of ["추천", "유리", "권합니다", "권해요", "이걸 고르", "최적", "가장 좋"]) {
      expect(BODY, bad).not.toContain(bad);
    }
  });

  it("비교 숫자를 화면에서 만들지 않는다", () => {
    const ARITH = [
      /(amort_payment|crisis_prob|limit|principal)\s*[*/]\s*[\d(]/,
      /[\d)]\s*[*/]\s*(amort_payment|crisis_prob|limit|principal)/,
    ];
    const hits = BODY.split("\n")
      .map((l, i) => [i + 1, l] as const)
      .filter(([, l]) => ARITH.some((re) => re.test(l)));
    expect(hits.map(([n, l]) => `${n}: ${l.trim()}`)).toEqual([]);
  });

  it("비교 계산이 실패하면 빈 칸이 아니라 실패라고 쓴다", () => {
    expect(BODY).toContain("계산 실패");
    expect(SRC).toContain("console.warn");
  });

  it("상품마다 엔진을 따로 돌린다 — 한 번 돌리고 화면에서 환산하지 않는다", () => {
    expect(BODY).toContain("runDiagnose");
    expect(BODY).toContain("product_id: p.id");
  });

  it("넓은 표는 자기 안에서 가로 스크롤한다", () => {
    expect(BODY).toContain("overflow-x-auto");
  });
});
