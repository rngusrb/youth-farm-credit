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
