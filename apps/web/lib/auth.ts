/** 데모 로그인.
 *
 * **실제 인증이 아니다.** 아이디·비밀번호가 코드에 그대로 박혀 있고 검증도
 * 브라우저에서 한다. MVP 화면 흐름(공개 포털 → 로그인 → 업무 화면)을 보여주기
 * 위한 장치이며, 이 상태로 배포하면 안 된다.
 *
 * 상태는 **구독 가능한 스토어**로 둔다. localStorage 만 바꾸면 이미 화면에 떠 있는
 * 컴포넌트가 모른다 — UtilBar 가 루트 레이아웃에 있어 클라이언트 이동으로는
 * remount 되지 않기 때문이다. (2026-08-26 로그인 후 메인으로 가면 다시 로그아웃으로
 * 보이던 버그의 원인)
 */
export type Role = "farmer" | "bank";

export type Session = { id: string; role: Role; name: string; org: string; at: number };

const KEY = "yfc.session.v1";

/** 데모 계정. **계정이 역할을 정한다** — 라디오 버튼으로 고르게 두면
 *  아무나 금융기관 화면에 들어갈 수 있어서 심사 화면의 의미가 없어진다.
 *
 *  **객체가 아니라 배열이다.** 아이디를 키로 쓰는 객체에 두면 JS 가 정수처럼 보이는
 *  키("222222")를 앞으로 당겨서 순서가 뒤집힌다 — "000000" 은 앞자리 0 때문에
 *  정수 키가 아니라 뒤로 간다. 그래서 화면에 "농가 222222" 라고 잘못 떴었다. */
export const DEMO_ACCOUNTS = [
  { id: "000000", pw: "111111", role: "farmer" as Role, name: "김청년", org: "청년후계농" },
  { id: "222222", pw: "333333", role: "bank" as Role, name: "박심사", org: "농협은행 여신심사부" },
];

export const ROLE_LABEL: Record<Role, string> = { farmer: "농가", bank: "금융기관" };

/** 역할별 업무 홈. 로그인 후 갈 곳이자, 이미 로그인한 사람에게 보여줄 링크. */
export const ROLE_HOME: Record<Role, string> = { farmer: "/app", bank: "/bank" };

// ── 구독 스토어 ───────────────────────────────────────────
let cache: Session | null | undefined;   // undefined = 아직 안 읽음
const listeners = new Set<() => void>();

function readStorage(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    // 조용히 넘기지 않는다 — 저장소가 깨진 사실은 남긴다.
    console.warn("세션을 읽지 못해 로그아웃 상태로 봅니다.");
    return null;
  }
}

function emit(): void {
  for (const l of listeners) l();
}

function commit(next: Session | null): void {
  cache = next;
  if (typeof window !== "undefined") {
    if (next) window.localStorage.setItem(KEY, JSON.stringify(next));
    else window.localStorage.removeItem(KEY);
  }
  emit();
}

/** 다른 탭에서 로그인/로그아웃하면 이 탭도 따라간다. */
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      cache = undefined;
      emit();
    }
  });
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function currentSession(): Session | null {
  if (cache === undefined) cache = readStorage();
  return cache;
}

/** useSyncExternalStore 의 서버 스냅샷. 서버에서는 항상 로그아웃으로 본다. */
export const serverSession = (): Session | null => null;

// ── 동작 ─────────────────────────────────────────────────

export function signIn(id: string, pw: string): Session | null {
  const a = DEMO_ACCOUNTS.find((x) => x.id === id);
  if (!a || a.pw !== pw) return null;
  const s: Session = { id, role: a.role, name: a.name, org: a.org, at: Date.now() };
  commit(s);
  return s;
}

export function signOut(): void {
  commit(null);
}

/** 순서에 기대지 않고 역할로 찾는다. 인덱스로 꺼내다 농가/금융기관이 뒤바뀐 적이 있다. */
const byRole = (r: Role) => DEMO_ACCOUNTS.find((a) => a.role === r)!;

export const DEMO_HINT =
  `데모 계정 — 농가 ${byRole("farmer").id}/${byRole("farmer").pw} · ` +
  `금융기관 ${byRole("bank").id}/${byRole("bank").pw}`;
