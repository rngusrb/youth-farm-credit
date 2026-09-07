import { beforeEach, describe, expect, it } from "vitest";

import { APPLICANTS } from "@/lib/applicants";
import { borrowerOf, currentBorrowerRef, selectBorrower, subscribeBorrower } from "@/lib/borrower";
import { cached, clearAnalysisCache } from "@/lib/analysisCache";

/**
 * 심사 화면이 "누구를 보는지" 를 아는 것 — 이 기능의 전부다.
 *
 * 사고 이력 2026-09-07: capacity·design·stress 세 화면이 useFarm() 을 써서
 * **농가 계정의 저장소**를 보고 있었다. 차주 목록에 5명이 있는데 세 화면은
 * 그 선택을 몰랐고, 목록에서 눌러도 리포트로 갈 뿐이었다.
 */
describe("심사 대상 차주 선택", () => {
  beforeEach(() => {
    localStorage.clear();
    selectBorrower(null);
    clearAnalysisCache();
  });

  it("고르면 남고, 다시 읽으면 그대로다", () => {
    expect(currentBorrowerRef()).toBeNull();
    selectBorrower(APPLICANTS[1].ref);
    expect(currentBorrowerRef()).toBe(APPLICANTS[1].ref);
    expect(borrowerOf(currentBorrowerRef())?.name).toBe(APPLICANTS[1].name);
  });

  it("고른 차주의 조건이 그 차주 것이다 — 농가 프로필이 아니다", () => {
    selectBorrower("2026-0433");
    const b = borrowerOf(currentBorrowerRef());
    expect(b?.name).toBe("박도현");
    expect(b?.pyeong).toBe(6000);
  });

  it("목록에 없는 번호면 null 이다 — 옛 저장값에 기대지 않는다", () => {
    selectBorrower("없는-번호");
    expect(borrowerOf(currentBorrowerRef())).toBeNull();
  });

  it("바뀌면 구독자가 안다", () => {
    let hits = 0;
    const off = subscribeBorrower(() => { hits += 1; });
    selectBorrower("2026-0417");
    selectBorrower("2026-0421");
    off();
    expect(hits).toBe(2);
  });
});

describe("결과 캐시", () => {
  beforeEach(() => clearAnalysisCache());

  it("같은 키면 한 번만 계산한다", async () => {
    let runs = 0;
    const run = async () => { runs += 1; return runs; };
    await cached("k", run);
    await cached("k", run);
    expect(runs).toBe(1);
  });

  it("키가 다르면 다시 계산한다 — 차주가 바뀌면 조건도 바뀐다", async () => {
    let runs = 0;
    const run = async () => { runs += 1; return runs; };
    await cached("capacity:2026-0417", run);
    await cached("capacity:2026-0421", run);
    expect(runs).toBe(2);
  });

  it("실패는 캐시하지 않는다 — 다시 시도할 수 있어야 한다", async () => {
    let runs = 0;
    const boom = async () => { runs += 1; throw new Error("fail"); };
    await expect(cached("x", boom)).rejects.toThrow();
    await expect(cached("x", boom)).rejects.toThrow();
    expect(runs).toBe(2);
  });

  it("비우면 다시 계산한다", async () => {
    let runs = 0;
    const run = async () => { runs += 1; return runs; };
    await cached("y", run);
    clearAnalysisCache();
    await cached("y", run);
    expect(runs).toBe(2);
  });
});
