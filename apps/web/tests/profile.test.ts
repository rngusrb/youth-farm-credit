import { beforeEach, describe, expect, it } from "vitest";
import {
  clearProfile,
  loadProfile,
  loadReports,
  removeReport,
  saveProfile,
  saveReport,
  type SavedReport,
} from "@/lib/profile";

const profile = {
  cropId: "strawberry_hydro",
  pyeong: 3025,
  livingCost: 30_000_000,
  otherDebtService: 0,
  incomeHistory: [42_000_000, 38_000_000, 51_000_000],
  productId: "successor_farmer",
};

const report = (id: string): SavedReport => ({
  id,
  cropName: "딸기(시설,수경)",
  pyeong: 3025,
  productName: "후계농업경영인 육성자금",
  riskLimit: 500_000_000,
  crisisProb: 0.02,
  savedAt: Date.now(),
});

describe("로컬 저장소", () => {
  beforeEach(() => window.localStorage.clear());

  it("농가 정보를 넣고 뺀다", () => {
    expect(loadProfile()).toBeNull();
    saveProfile(profile);
    expect(loadProfile()).toEqual(profile);
    clearProfile();
    expect(loadProfile()).toBeNull();
  });

  it("깨진 값이 들어 있어도 앱을 멈추지 않는다", () => {
    window.localStorage.setItem("yfc.profile.v1", "{ not json");
    expect(loadProfile()).toBeNull();
  });

  it("같은 리포트를 두 번 저장하면 하나로 합치고 맨 앞에 둔다", () => {
    saveReport(report("a"));
    saveReport(report("b"));
    saveReport(report("a"));
    expect(loadReports().map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("최대 12건까지만 남긴다 — 기록이 무한히 쌓이면 목록이 쓸모없어진다", () => {
    for (let i = 0; i < 20; i++) saveReport(report(`r${i}`));
    expect(loadReports()).toHaveLength(12);
    expect(loadReports()[0].id).toBe("r19");
  });

  it("삭제한 리포트는 사라진다", () => {
    saveReport(report("a"));
    removeReport("a");
    expect(loadReports()).toEqual([]);
  });
});

describe("계정마다 저장 칸이 다르다", () => {
  const login = (id: string) =>
    localStorage.setItem("yfc.session.v1", JSON.stringify({ id, role: "farmer", name: id, org: "", at: 1 }));

  beforeEach(() => localStorage.clear());

  it("다른 계정으로 들어가면 앞사람 농가 정보가 보이지 않는다", () => {
    // 사고 이력 2026-09-07: 저장 키가 하나뿐이라 새로 가입해 들어가도
    // **앞사람이 넣은 작목·면적·생활비가 그대로 떠 있었다.**
    login("000000");
    saveProfile({ ...profile, pyeong: 1300 });
    expect(loadProfile()?.pyeong).toBe(1300);

    login("newbie01");
    expect(loadProfile()).toBeNull();
  });

  it("각자 넣은 값이 서로 덮이지 않는다", () => {
    login("aaa");
    saveProfile({ ...profile, pyeong: 1000 });
    login("bbb");
    saveProfile({ ...profile, pyeong: 2000 });

    login("aaa");
    expect(loadProfile()?.pyeong).toBe(1000);
    login("bbb");
    expect(loadProfile()?.pyeong).toBe(2000);
  });

  it("리포트도 계정별로 나뉜다", () => {
    const report = (id: string): SavedReport => ({
      id, cropName: "딸기", productName: "후계농업경영인 육성자금",
      pyeong: 1300, riskLimit: 1, crisisProb: 0.1, savedAt: 1,
    });
    login("aaa");
    saveReport(report("r-a"));
    login("bbb");
    expect(loadReports()).toHaveLength(0);
    saveReport(report("r-b"));

    login("aaa");
    expect(loadReports().map((r) => r.id)).toEqual(["r-a"]);
  });

  it("로그아웃 상태에서도 화면이 돈다 — 공용 칸을 쓴다", () => {
    saveProfile({ ...profile, pyeong: 777 });
    expect(loadProfile()?.pyeong).toBe(777);
  });
});
