import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// cwd 에 기대지 않는다 — 하네스는 저장소 루트에서 vitest 를 부른다.
const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 소스를 훑어 간결 본문 useEffect 를 찾는다.
 *
 * 사고 이력(2026-08-27): `useEffect(() => el?.scrollIntoView(...), [x])` 처럼
 * 간결 본문을 쓰면 **식의 반환값이 그대로 cleanup 으로 넘어간다.** 보통은
 * undefined 라 조용하지만, 브라우저 확장이나 폴리필이 그 메서드를 패치해 뭔가
 * 반환하게 만들면 React 가
 * "useEffect must not return anything besides a function" 을 던진다.
 * 우리 코드가 멀쩡해도 사용자 환경에서만 터져서 재현이 어렵다. 블록 본문이면 면역이다.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "tests") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

function conciseEffects(src: string): string[] {
  const hits: string[] = [];
  const re = /useEffect\(\s*(?:\(\s*\)|\w+)\s*=>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    while (i < src.length && /\s/.test(src[i])) i++;
    if (src[i] !== "{") hits.push(src.slice(i, i + 60).split("\n")[0]);
  }
  return hits;
}

describe("useEffect 는 블록 본문으로 쓴다", () => {
  it("간결 본문이 하나도 없다", () => {
    const bad: string[] = [];
    for (const dir of ["app", "components", "lib"]) {
      for (const f of walk(join(WEB, dir))) {
        for (const h of conciseEffects(readFileSync(f, "utf8"))) {
          bad.push(`${f} → ${h}`);
        }
      }
    }
    expect(bad, `간결 본문 useEffect 발견:\n${bad.join("\n")}`).toEqual([]);
  });
});
