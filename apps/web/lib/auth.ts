/** 데모 로그인.
 *
 * **실제 인증이 아니다.** 아이디·비밀번호가 코드에 그대로 박혀 있고 검증도
 * 브라우저에서 한다. MVP 화면 흐름(공개 포털 → 로그인 → 업무 화면)을 보여주기
 * 위한 장치이며, 이 상태로 배포하면 안 된다.
 */
export type Role = "farmer" | "bank";

export type Session = { id: string; role: Role; name: string; org: string; at: number };

const KEY = "yfc.session.v1";

const DEMO = {
  id: "000000",
  pw: "111111",
} as const;

export const ROLE_LABEL: Record<Role, string> = {
  farmer: "농가",
  bank: "금융기관",
};

export function signIn(id: string, pw: string, role: Role): Session | null {
  if (id !== DEMO.id || pw !== DEMO.pw) return null;
  const s: Session = {
    id,
    role,
    name: role === "farmer" ? "데모 농가" : "데모 심사역",
    org: role === "farmer" ? "청년후계농" : "농협은행 여신심사부",
    at: Date.now(),
  };
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, JSON.stringify(s));
  return s;
}

export function currentSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    console.warn("세션을 읽지 못해 로그아웃 상태로 봅니다.");
    return null;
  }
}

export function signOut(): void {
  if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
}

export function switchRole(role: Role): Session | null {
  const s = currentSession();
  if (!s) return null;
  const next = { ...s, role, name: role === "farmer" ? "데모 농가" : "데모 심사역",
                 org: role === "farmer" ? "청년후계농" : "농협은행 여신심사부" };
  window.localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export const DEMO_HINT = `데모 계정 — 아이디 ${DEMO.id} / 비밀번호 ${DEMO.pw}`;
