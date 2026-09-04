import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const WEB = join(__dirname, "..");
const read = (p: string) => readFileSync(join(WEB, p), "utf8");

/**
 * 한 화면이 진단과 다른 소득으로 계산되지 않는지 — **웹 쪽에서** 본다.
 *
 * 사고 이력 2026-09-02: 엔진과 HTTP 스키마를 구조로 막았는데도 같은 분열이
 * 두 번 더 나왔다. `/app/safety`·`/bank/stress` 가 진단에는 실적을 보내고
 * 스트레스에는 안 보냈다. 파이썬 쪽 검사는 스키마 필드 **존재**만 봐서 이걸
 * 못 잡았다 (적대적 리뷰 H1·M3). 화면이 실제로 보내는지는 여기서 본다.
 */
const PAIRS: [string, string[]][] = [
  ["app/app/safety/page.tsx", ["runDiagnose", "fetchStress"]],
  ["app/bank/stress/page.tsx", ["runDiagnose", "fetchStress"]],
  ["app/app/map/page.tsx", ["fetchFundingMap", "fetchCashflow"]],
  ["app/app/revenue/page.tsx", ["runDiagnose", "fetchCashflow"]],
];

describe("한 화면 = 한 소득", () => {
  it.each(PAIRS)("%s 의 계산 호출이 모두 실적을 보낸다", (file, calls) => {
    const src = read(file);
    for (const call of calls) {
      const at = src.indexOf(`${call}(`);
      expect(at, `${file} 에 ${call} 호출이 없다`).toBeGreaterThan(-1);
      const body = src.slice(at, src.indexOf("})", at) + 2);
      const ok = /income_history|actual_income/.test(body) || /\.\.\.base/.test(body);
      expect(ok, `${file} 의 ${call} 이 실적을 안 보낸다`).toBe(true);
    }
  });

  it("base 를 공유하는 화면은 base 자체에 실적이 들어 있다", () => {
    for (const f of ["app/app/page.tsx", "app/bank/capacity/page.tsx"]) {
      const src = read(f);
      const at = src.indexOf("const base = {");
      expect(at, `${f} 에 base 가 없다`).toBeGreaterThan(-1);
      expect(src.slice(at, src.indexOf("};", at)),
        `${f} 의 base 에 실적이 없다`).toMatch(/income_history/);
    }
  });
});

describe("파생값을 통계로 표시하지 않는다", () => {
  it("bank/capacity 는 스케일이 걸리면 배지를 바꾼다", () => {
    const src = read("app/bank/capacity/page.tsx");
    expect(src).toMatch(/income_basis\.scale/);
    expect(src).toMatch(/src:\s*"assumed"/);
  });
});

describe("밝히겠다고 만든 필드는 화면에 나온다", () => {
  it("map 화면이 income_basis 와 income.source 를 읽는다", () => {
    const src = read("app/app/map/page.tsx");
    expect(src).toMatch(/income_basis\.note/);
    expect(src).toMatch(/income\.source/);
  });
});
