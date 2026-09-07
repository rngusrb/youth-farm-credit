"use client";

/** 심사 대상 차주 선택 — 금융기관 화면 공용.
 *
 * ## 왜 만들었나
 *
 * 사고 이력 2026-09-07: `capacity`·`design`·`stress` 세 화면이 전부 `useFarm()` 을
 * 쓰고 있었다. 그건 **농가 계정이 자기 농장정보를 넣는 저장소**다. 차주 목록에는
 * 5명이 있는데 세 화면은 그 선택을 모르고, 목록에서 차주를 눌러도 리포트로 갈 뿐이었다.
 * 심사역 입장에서 "이 화면이 누구 걸 보여주는 건지" 를 알 수 없었다.
 *
 * ## 구독 스토어인 이유
 *
 * 상단 표시줄이 레이아웃에 있어 클라이언트 이동으로는 remount 되지 않는다.
 * localStorage 만 바꾸면 이미 떠 있는 화면이 모른다 — auth.ts 가 같은 이유로
 * 같은 구조를 쓴다 (2026-08-26 로그인 후 로그아웃으로 보이던 버그).
 */
import { APPLICANTS, type Applicant } from "./applicants";

const KEY = "yfc.borrower.v1";

let cache: string | null | undefined;          // undefined = 아직 안 읽음
const listeners = new Set<() => void>();

function readStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    console.warn("심사 대상을 읽지 못해 선택 없음으로 봅니다.");
    return null;
  }
}

function emit(): void {
  for (const l of listeners) l();
}

/** 다른 탭에서 바꾸면 이 탭도 따라간다. */
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      cache = undefined;
      emit();
    }
  });
}

export function subscribeBorrower(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 지금 고른 차주의 접수번호. 없으면 null. */
export function currentBorrowerRef(): string | null {
  if (cache === undefined) cache = readStorage();
  return cache;
}

/** useSyncExternalStore 의 서버 스냅샷. 서버에서는 항상 선택 없음. */
export const serverBorrowerRef = (): string | null => null;

export function selectBorrower(ref: string | null): void {
  cache = ref;
  if (typeof window !== "undefined") {
    if (ref) window.localStorage.setItem(KEY, ref);
    else window.localStorage.removeItem(KEY);
  }
  emit();
}

/** 접수번호 → 차주. 목록에 없는 번호(저장소가 오래됨)면 null 이고, 화면은 다시 고르게 한다. */
export function borrowerOf(ref: string | null): Applicant | null {
  if (!ref) return null;
  return APPLICANTS.find((a) => a.ref === ref) ?? null;
}
