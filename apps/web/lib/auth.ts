/** 로그인과 가입 — **브라우저 안에서만** 돈다.
 *
 * **실제 인증이 아니다.** 검증도 저장도 브라우저에서 한다. 저장소를 열 수 있는
 * 사람에게는 아무 방벽이 아니다. MVP 화면 흐름(공개 포털 → 로그인 → 업무 화면)을
 * 보여주기 위한 장치이며, 이 상태로 운영에 쓸 수 없다.
 *
 * ## 왜 서버를 안 두나
 * 제출한 기능명세서 §4 가 "개인식별정보 무수집 / 서버에 보관하지 않고 브라우저에만
 * 저장 / DB 저장 없이 즉시 파기" 라고 적고 있다. 서버 회원가입을 붙이면 그 문서가
 * 거짓이 된다. 그래서 가입 정보도 그 사람 브라우저에만 둔다. (2026-09-07)
 *
 * ## 비밀번호
 * 평문으로 두지 않는다 — SHA-256 + 사용자별 salt 로 저장한다. 다만 이건 **보안이
 * 아니라 위생**이다. 클라이언트 해싱은 저장소를 읽을 수 있는 사람을 못 막는다.
 * 평문이 굴러다니지 않게 하는 정도의 뜻이다.
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

// ── 가입 계정 (브라우저 저장) ─────────────────────────────

const USERS_KEY = "yfc.users.v1";

export type LocalUser = {
  id: string; role: Role; name: string; org: string;
  salt: string; hash: string;   // 평문 비밀번호는 저장하지 않는다
};

function readUsers(): LocalUser[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(USERS_KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? (v as LocalUser[]) : [];
  } catch {
    console.warn("가입 정보를 읽지 못했습니다. 없는 것으로 봅니다.");
    return [];
  }
}

function writeUsers(users: LocalUser[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

/** SHA-256(salt + pw). Web Crypto 는 https 또는 localhost 에서만 있다 —
 *  없으면 가입을 막는다. 평문으로 흘려 저장하느니 안 되는 편이 낫다. */
async function hashPw(pw: string, salt: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("이 브라우저에서는 가입을 지원하지 않아요 (보안 컨텍스트 필요)");
  const bytes = new TextEncoder().encode(`${salt}:${pw}`);
  const digest = await subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomSalt(): string {
  const a = new Uint8Array(16);
  globalThis.crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type SignUpInput = { id: string; pw: string; name: string; org?: string; role: Role };

/** 가입. 실패하면 **이유를 문자열로** 돌려준다 (null 이면 성공). */
export async function signUp(input: SignUpInput): Promise<string | null> {
  const id = input.id.trim();
  const name = input.name.trim();
  if (id.length < 3) return "아이디는 3자 이상이어야 해요.";
  if (input.pw.length < 6) return "비밀번호는 6자 이상이어야 해요.";
  if (!name) return "이름을 적어 주세요.";
  if (DEMO_ACCOUNTS.some((a) => a.id === id)) return "이미 쓰이는 아이디예요.";
  const users = readUsers();
  if (users.some((u) => u.id === id)) return "이미 가입된 아이디예요.";

  const salt = randomSalt();
  const hash = await hashPw(input.pw, salt);
  const org = (input.org || "").trim() || (input.role === "farmer" ? "개인 농가" : "금융기관");
  writeUsers([...users, { id, role: input.role, name, org, salt, hash }]);
  return null;
}

/** 로그인. **데모 계정이 먼저다** — 심사 진입로를 가입 계정이 덮지 못하게 한다. */
export async function signIn(id: string, pw: string): Promise<Session | null> {
  const a = DEMO_ACCOUNTS.find((x) => x.id === id);
  if (a) {
    if (a.pw !== pw) return null;
    const s: Session = { id, role: a.role, name: a.name, org: a.org, at: Date.now() };
    commit(s);
    return s;
  }
  const u = readUsers().find((x) => x.id === id);
  if (!u) return null;
  if ((await hashPw(pw, u.salt)) !== u.hash) return null;
  const s: Session = { id, role: u.role, name: u.name, org: u.org, at: Date.now() };
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
