import { describe, expect, it } from "vitest";
import { unsafeGap } from "@/lib/diagnosis";
import type { Diagnosis } from "@/lib/api";

describe("위험 구간(unsafe_gap)", () => {
  it("화면에서 빼지 않고 엔진 값을 그대로 쓴다", () => {
    // 사고 이력: 화면과 해설이 각자 빼서 만들었더니 해설 쪽 수치가
    // 엔진 출력에 없다는 이유로 검증층(llm/verify.py)에 걸려 문장이 통째로 사라졌다.
    const d = {
      limits: { available: 500_000_000, risk_based: 210_815_430, unsafe_gap: 289_184_570 },
    } as unknown as Diagnosis;
    expect(unsafeGap(d)).toBe(289_184_570);
  });

  it("엔진 값이 우선이다 — 직접 뺀 값과 다르면 엔진을 따른다", () => {
    const d = {
      limits: { available: 500_000_000, risk_based: 210_815_430, unsafe_gap: 0 },
    } as unknown as Diagnosis;
    expect(unsafeGap(d)).toBe(0);
  });
});
