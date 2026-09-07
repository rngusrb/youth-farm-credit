import { beforeEach, describe, expect, it, vi } from "vitest";
import { currentSession, signIn, signOut, signUp, subscribe } from "@/lib/auth";

describe("데모 로그인", () => {
  beforeEach(() => {
    window.localStorage.clear();
    signOut(); // 모듈 캐시까지 비운다
  });

  it("정해진 계정만 통과한다", async () => {
    expect(await signIn("000000", "111111")).not.toBeNull();
    expect(await signIn("000000", "wrong")).toBeNull();
    expect(await signIn("999999", "111111")).toBeNull();
  });

  it("계정이 역할을 정한다 — 화면에서 고를 수 없다", async () => {
    expect((await signIn("000000", "111111"))?.role).toBe("farmer");
    expect((await signIn("222222", "333333"))?.role).toBe("bank");
  });

  it("농가 계정으로 금융기관 역할을 얻을 수 없다", async () => {
    // 라디오 버튼으로 역할을 고르던 시절엔 가능했다. 이제 계정에 묶인다.
    const s = await signIn("000000", "111111");
    expect(s?.role).not.toBe("bank");
  });

  it("로그인하면 세션이 남고 로그아웃하면 사라진다", async () => {
    await signIn("222222", "333333");
    expect(currentSession()?.role).toBe("bank");
    signOut();
    expect(currentSession()).toBeNull();
  });

  it("로그인·로그아웃이 구독자에게 알려진다", async () => {
    // 이게 없어서 로그인 후 메인으로 가면 다시 '로그인' 으로 보였다.
    // UtilBar 는 루트 레이아웃에 있어 클라이언트 이동으로 remount 되지 않는다.
    const spy = vi.fn();
    const off = subscribe(spy);
    await signIn("000000", "111111");
    expect(spy).toHaveBeenCalledTimes(1);
    signOut();
    expect(spy).toHaveBeenCalledTimes(2);
    off();
    await signIn("000000", "111111");
    expect(spy).toHaveBeenCalledTimes(2); // 구독 해제 후엔 안 온다
  });

  it("다른 탭의 변경(storage 이벤트)을 따라간다", async () => {
    await signIn("000000", "111111");
    const spy = vi.fn();
    const off = subscribe(spy);
    // 다른 탭이 지운 상황을 흉내낸다
    window.localStorage.removeItem("yfc.session.v1");
    window.dispatchEvent(new StorageEvent("storage", { key: "yfc.session.v1" }));
    expect(spy).toHaveBeenCalled();
    expect(currentSession()).toBeNull();
    off();
  });

  it("저장소가 깨져 있어도 앱을 멈추지 않는다", async () => {
    window.localStorage.setItem("yfc.session.v1", "{ not json");
    window.dispatchEvent(new StorageEvent("storage", { key: "yfc.session.v1" }));
    expect(currentSession()).toBeNull();
  });
});

describe("데모 계정 표기", () => {
  it("농가와 금융기관이 뒤바뀌지 않는다", async () => {
    const { DEMO_ACCOUNTS, DEMO_HINT } = await import("@/lib/auth");
    // 사고 이력: 아이디를 키로 쓰는 객체에 두었더니 JS 가 정수처럼 보이는 "222222" 를
    // 앞으로 당겨 화면에 "농가 222222" 라고 잘못 떴다. 배열로 바꿔 순서를 고정했다.
    expect(DEMO_ACCOUNTS[0].role).toBe("farmer");
    expect(DEMO_ACCOUNTS[0].id).toBe("000000");
    expect(DEMO_ACCOUNTS[1].role).toBe("bank");
    expect(DEMO_HINT).toContain("농가 000000");
    expect(DEMO_HINT).toContain("금융기관 222222");
  });

  it("역할별 업무 홈이 갈린다", async () => {
    const { ROLE_HOME } = await import("@/lib/auth");
    expect(ROLE_HOME.farmer).toBe("/app");
    expect(ROLE_HOME.bank).toBe("/bank");
  });
});

describe("가입 — 브라우저 안에서만", () => {
  beforeEach(() => {
    localStorage.clear();
    signOut();
  });

  it("가입한 계정으로 로그인된다", async () => {
    expect(await signUp({ id: "farmer01", pw: "abcdef", name: "홍길동", role: "farmer" })).toBeNull();
    const s = await signIn("farmer01", "abcdef");
    expect(s?.role).toBe("farmer");
    expect(s?.name).toBe("홍길동");
  });

  it("비밀번호를 평문으로 저장하지 않는다", async () => {
    await signUp({ id: "farmer02", pw: "supersecret", name: "김농부", role: "farmer" });
    const raw = localStorage.getItem("yfc.users.v1") ?? "";
    expect(raw).not.toContain("supersecret");
    expect(raw).toContain("hash");
  });

  it("틀린 비밀번호는 막는다", async () => {
    await signUp({ id: "farmer03", pw: "abcdef", name: "이농부", role: "farmer" });
    expect(await signIn("farmer03", "abcdeg")).toBeNull();
  });

  it("이유를 말하고 거절한다 — 짧은 값·중복 아이디", async () => {
    expect(await signUp({ id: "ab", pw: "abcdef", name: "가", role: "farmer" })).toMatch(/아이디/);
    expect(await signUp({ id: "abcd", pw: "123", name: "가", role: "farmer" })).toMatch(/비밀번호/);
    await signUp({ id: "dup01", pw: "abcdef", name: "가", role: "farmer" });
    expect(await signUp({ id: "dup01", pw: "abcdef", name: "나", role: "bank" })).toMatch(/이미/);
  });

  it("데모 계정 아이디는 뺏을 수 없다 — 심사 진입로를 지킨다", async () => {
    expect(await signUp({ id: "000000", pw: "abcdef", name: "가짜", role: "bank" })).toMatch(/이미/);
    // 데모 계정은 그대로 동작해야 한다
    expect((await signIn("000000", "111111"))?.role).toBe("farmer");
  });

  it("가입 계정도 계정이 역할을 정한다", async () => {
    await signUp({ id: "bank01", pw: "abcdef", name: "박심사", role: "bank" });
    expect((await signIn("bank01", "abcdef"))?.role).toBe("bank");
  });
});
