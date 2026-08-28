/**
 * 지난 분석과의 비교 (UX-015).
 *
 * **차이를 숫자로 만들지 않는다.** 두 값과 방향만. 화면에서 뺄셈을 시작하면
 * 그 값의 출처가 어디인지 아무도 모르게 된다.
 * 기록이 하나뿐이면 **없는 비교를 만들지 않는다.**
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dir, inputChanges } from "../components/ReportDiff";
import type { SavedReport } from "../lib/profile";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = readFileSync(join(WEB, "components/ReportDiff.tsx"), "utf8");
const BODY = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const base: SavedReport = {
  id: "dg_a", cropName: "딸기(시설,수경)", pyeong: 1200,
  productName: "후계농업경영인 육성자금", riskLimit: 210_815_430,
  crisisProb: 0.0999, savedAt: 1_700_000_000_000,
};

describe("방향", () => {
  it("늘고 줄고 그대로를 가린다", () => {
    expect(dir(100, 200)).toBe("up");
    expect(dir(200, 100)).toBe("down");
    expect(dir(100, 100)).toBe("same");
  });
});

describe("입력 변화", () => {
  it("바뀐 것만 낸다", () => {
    const after = { ...base, pyeong: 1500 };
    expect(inputChanges(base, after).map((c) => c.label)).toEqual(["면적"]);
  });

  it("그대로면 아무것도 안 낸다", () => {
    expect(inputChanges(base, { ...base, savedAt: 1 })).toEqual([]);
  });

  it("작목·정책자금이 함께 바뀌면 둘 다", () => {
    const after = { ...base, cropName: "토마토(시설,수경)", productName: "우수후계농업경영인 육성자금" };
    expect(inputChanges(base, after).map((c) => c.label)).toEqual(["작목", "정책자금"]);
  });
});

describe("규칙", () => {
  it("차액을 계산하지 않는다 — 뺄셈이 없다", () => {
    const hits = BODY.split("\n")
      .map((l, i) => [i + 1, l] as const)
      .filter(([, l]) => /(riskLimit|crisisProb|pyeong)\s*-\s*\w/.test(l));
    expect(hits.map(([n, l]) => `${n}: ${l.trim()}`)).toEqual([]);
  });

  it("기록이 하나뿐이면 비교를 그리지 않는다", () => {
    expect(BODY).toContain("rows.length < 2");
  });

  it("방향에 좋다/나쁘다를 붙이지 않는다 (화법 규칙 2)", () => {
    for (const bad of ["좋아", "나빠", "개선", "악화", "안전해", "위험해졌"]) {
      expect(BODY, bad).not.toContain(bad);
    }
  });
});
