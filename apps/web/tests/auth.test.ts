import { beforeEach, describe, expect, it } from "vitest";
import { currentSession, signIn, signOut, switchRole } from "@/lib/auth";

describe("데모 로그인", () => {
  beforeEach(() => window.localStorage.clear());

  it("정해진 계정만 통과한다", () => {
    expect(signIn("000000", "111111", "farmer")).not.toBeNull();
    expect(signIn("000000", "wrong", "farmer")).toBeNull();
    expect(signIn("999999", "111111", "farmer")).toBeNull();
  });

  it("로그인하면 세션이 남고 로그아웃하면 사라진다", () => {
    signIn("000000", "111111", "bank");
    expect(currentSession()?.role).toBe("bank");
    signOut();
    expect(currentSession()).toBeNull();
  });

  it("역할만 바꿔도 로그인 상태는 유지된다", () => {
    signIn("000000", "111111", "farmer");
    expect(switchRole("bank")?.role).toBe("bank");
    expect(currentSession()?.role).toBe("bank");
  });

  it("로그인하지 않았으면 역할을 바꿀 수 없다", () => {
    expect(switchRole("bank")).toBeNull();
  });
});
