/**
 * 금액별 비교표 (UX-013).
 *
 * 이 표의 값은 **전부 엔진 응답 그대로**여야 한다. 비교할 금액도 화면이 정하지
 * 않는다 — 화면이 금액을 만들기 시작하면 리포트와 대시보드의 숫자가 갈라지고,
 * 어느 쪽이 맞는지 아무도 모르게 된다.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(
  join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "components/AmountCompare.tsx"),
  "utf8",
);

describe("AmountCompare", () => {
  it("금액을 화면에서 만들지 않는다 — 리터럴 금액이 없다", () => {
    // 5000_0000 처럼 숫자로 박아 넣은 금액. 0 이 4개 이상 이어지면 금액이다.
    const hits = SRC.split("\n")
      .map((l, i) => [i + 1, l] as const)
      .filter(([, l]) => /\b\d{5,}\b|\d+_0{3,}/.test(l) && !l.trim().startsWith("*"));
    expect(hits.map(([n, l]) => `${n}: ${l.trim()}`)).toEqual([]);
  });

  it("금액을 산술로 만들지 않는다 — 배율·나눗셈이 없다", () => {
    // JSX 닫는 태그(`</td>`)의 / 를 잡지 않도록, **금액과 숫자 사이의 연산**만 본다.
    const ARITH = [
      /(amount|principal|limits\.\w+)\s*[*/]\s*[\d(]/,
      /[\d)]\s*[*/]\s*(amount|principal|limits\.\w+)/,
    ];
    const hits = SRC.split("\n")
      .map((l, i) => [i + 1, l] as const)
      .filter(([, l]) => ARITH.some((re) => re.test(l)));
    expect(hits.map(([n, l]) => `${n}: ${l.trim()}`)).toEqual([]);
  });

  it("판정 문구를 쓰지 않는다 (화법 규칙 2)", () => {
    for (const bad of ["안전합니다", "안전해요", "감당할 수 있", "무리 없", "위험합니다"]) {
      expect(SRC, bad).not.toContain(bad);
    }
  });

  it("넓은 표는 자기 안에서 가로 스크롤한다 — 페이지가 밀리지 않게", () => {
    expect(SRC).toContain("overflow-x-auto");
  });
});
