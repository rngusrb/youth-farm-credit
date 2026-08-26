import { beforeEach, describe, expect, it, vi } from "vitest";
import { currentSession, signIn, signOut, subscribe } from "@/lib/auth";

describe("데모 로그인", () => {
  beforeEach(() => {
    window.localStorage.clear();
    signOut(); // 모듈 캐시까지 비운다
  });

  it("정해진 계정만 통과한다", () => {
    expect(signIn("000000", "111111")).not.toBeNull();
    expect(signIn("000000", "wrong")).toBeNull();
    expect(signIn("999999", "111111")).toBeNull();
  });

  it("계정이 역할을 정한다 — 화면에서 고를 수 없다", () => {
    expect(signIn("000000", "111111")?.role).toBe("farmer");
    expect(signIn("222222", "333333")?.role).toBe("bank");
  });

  it("농가 계정으로 금융기관 역할을 얻을 수 없다", () => {
    // 라디오 버튼으로 역할을 고르던 시절엔 가능했다. 이제 계정에 묶인다.
    const s = signIn("000000", "111111");
    expect(s?.role).not.toBe("bank");
  });

  it("로그인하면 세션이 남고 로그아웃하면 사라진다", () => {
    signIn("222222", "333333");
    expect(currentSession()?.role).toBe("bank");
    signOut();
    expect(currentSession()).toBeNull();
  });

  it("로그인·로그아웃이 구독자에게 알려진다", () => {
    // 이게 없어서 로그인 후 메인으로 가면 다시 '로그인' 으로 보였다.
    // UtilBar 는 루트 레이아웃에 있어 클라이언트 이동으로 remount 되지 않는다.
    const spy = vi.fn();
    const off = subscribe(spy);
    signIn("000000", "111111");
    expect(spy).toHaveBeenCalledTimes(1);
    signOut();
    expect(spy).toHaveBeenCalledTimes(2);
    off();
    signIn("000000", "111111");
    expect(spy).toHaveBeenCalledTimes(2); // 구독 해제 후엔 안 온다
  });

  it("다른 탭의 변경(storage 이벤트)을 따라간다", () => {
    signIn("000000", "111111");
    const spy = vi.fn();
    const off = subscribe(spy);
    // 다른 탭이 지운 상황을 흉내낸다
    window.localStorage.removeItem("yfc.session.v1");
    window.dispatchEvent(new StorageEvent("storage", { key: "yfc.session.v1" }));
    expect(spy).toHaveBeenCalled();
    expect(currentSession()).toBeNull();
    off();
  });

  it("저장소가 깨져 있어도 앱을 멈추지 않는다", () => {
    window.localStorage.setItem("yfc.session.v1", "{ not json");
    window.dispatchEvent(new StorageEvent("storage", { key: "yfc.session.v1" }));
    expect(currentSession()).toBeNull();
  });
});
