/** 브라우저 로컬 저장소.
 *
 * 로그인을 두지 않는다. 저장할 서버 상태가 없기 때문이다 — 진단 결과는 이미
 * 문서번호(URL)에 통째로 인코딩돼 있어서 링크가 곧 저장이다. 여기 담는 건
 * "이 브라우저를 쓰는 사람의 기본값" 뿐이고, 서버로 보내지 않는다.
 */
export type FarmProfile = {
  cropId: string;
  pyeong: number;
  livingCost: number;      // 원
  otherDebtService: number; // 원
  incomeHistory: number[];  // 원, 연도순
  productId: string;

  // ── 올해 계획 ──────────────────────────────────────────────────────
  // **엔진이 실제로 쓰는 것만 받는다.** '자금 용도'를 넣지 않은 이유가 이것이다 —
  // 상품이 후계농 자금 2종뿐이라 용도로 갈리는 계산이 없다. 계산에 안 쓰이는
  // 입력란은 채우게 만들어 놓고 아무것도 안 하는 장식이 된다.
  /** 올해 하려는 면적(평). 없으면 현재 면적으로 본다. */
  plannedPyeong?: number;
  /** 빌리려는 금액(원). 없으면 각 화면이 권장 한도를 기본값으로 쓴다. */
  targetPrincipal?: number;
};

export type SavedReport = {
  id: string;
  cropName: string;
  pyeong: number;
  productName: string;
  riskLimit: number;
  crisisProb: number;
  savedAt: number;
};

const PROFILE_KEY = "yfc.profile.v1";
const REPORTS_KEY = "yfc.reports.v1";
const MAX_REPORTS = 12;

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    // 저장소가 깨졌으면 조용히 기본값으로 가되, 흔적은 남긴다.
    console.warn(`localStorage '${key}' 를 읽지 못해 기본값을 씁니다.`);
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`localStorage '${key}' 저장 실패:`, e);
  }
}

export const loadProfile = (): FarmProfile | null => read<FarmProfile | null>(PROFILE_KEY, null);
export const saveProfile = (p: FarmProfile): void => write(PROFILE_KEY, p);
export const clearProfile = (): void => {
  if (typeof window !== "undefined") window.localStorage.removeItem(PROFILE_KEY);
};

export const loadReports = (): SavedReport[] => read<SavedReport[]>(REPORTS_KEY, []);

export function saveReport(r: SavedReport): void {
  const rest = loadReports().filter((x) => x.id !== r.id);
  write(REPORTS_KEY, [r, ...rest].slice(0, MAX_REPORTS));
}

export function removeReport(id: string): void {
  write(REPORTS_KEY, loadReports().filter((x) => x.id !== id));
}
