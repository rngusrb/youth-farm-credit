"use client";

import { useSyncExternalStore } from "react";

import { borrowerOf, currentBorrowerRef, serverBorrowerRef, subscribeBorrower } from "./borrower";
import type { Applicant } from "./applicants";

/** 지금 심사 중인 차주. 화면이 떠 있는 채로 바뀌어도 따라간다. */
export function useBorrower(): { borrower: Applicant | null; ref: string | null; ready: boolean } {
  const ref = useSyncExternalStore(subscribeBorrower, currentBorrowerRef, serverBorrowerRef);
  // 서버 렌더에서는 항상 null 이므로, 하이드레이션 뒤에야 판단할 수 있다.
  // ready 없이 곧바로 "선택 없음" 을 그리면 화면이 한 번 깜빡인다 (useFarm 과 같은 이유).
  const ready = typeof window !== "undefined";
  return { borrower: borrowerOf(ref), ref, ready };
}
