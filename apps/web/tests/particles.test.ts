/**
 * 금액 뒤 조사 (UX-011).
 *
 * `won()` 은 항상 "원" 으로 끝나고(받침 O), `pct()` 는 "%"(퍼센트, 받침 X) 로 끝난다.
 * 그래서 뒤에 붙는 조사가 갈린다 — `…원이에요`/`…원을` vs `…%예요`/`…%를`.
 *
 * 사고 이력: 화면에 "두 금액 사이가 2억 8,918만원예요", "5억원를 다 빌리면" 이
 * 떠 있었다. `_GUIDE.md` 화법 규칙 6 이 "기계 치환만으로는 문장이 깨진다" 고
 * 경고한 바로 그 자리다. 사람이 본다고 했는데 못 봤으므로 테스트로 고정한다.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { pct, won } from "../lib/format";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe("금액 서식", () => {
  it("won() 은 항상 원으로 끝난다 — 조사 규칙의 전제", () => {
    for (const v of [0, 1, 9_999, 10_000, 3_162_231, 210_820_000, 500_000_000, -50_000_000]) {
      expect(won(v).endsWith("원"), `won(${v}) = ${won(v)}`).toBe(true);
    }
  });

  it("pct() 는 항상 %로 끝난다", () => {
    for (const v of [0, 0.0999, 0.5, 1]) expect(pct(v).endsWith("%")).toBe(true);
  });
});

describe("화면의 조사", () => {
  const files = [join(WEB, "app"), join(WEB, "components")].flatMap((d) => walk(d));

  /** won(...) 바로 뒤에 받침 없는 말에 붙는 조사가 오면 틀린 것이다. */
  const WRONG_AFTER_WON = [
    { re: /won\([^)]*\)\}\s*예요/, say: "…원예요 → …원이에요" },
    { re: /won\([^)]*\)\}\s*를(?![가-힣])/, say: "…원를 → …원을" },
    { re: /won\([^)]*\)\}\s*는(?![가-힣])/, say: "…원는 → …원은" },
    { re: /won\([^)]*\)\}\s*가(?![가-힣])/, say: "…원가 → …원이" },
  ];

  it.each(WRONG_AFTER_WON)("금액 뒤에 $say 를 쓰지 않는다", ({ re }) => {
    const hits: string[] = [];
    for (const f of files) {
      for (const [n, line] of readFileSync(f, "utf8").split("\n").entries()) {
        if (re.test(line)) hits.push(`${f.slice(WEB.length + 1)}:${n + 1}  ${line.trim().slice(0, 90)}`);
      }
    }
    expect(hits, `\n${hits.join("\n")}`).toEqual([]);
  });
});
