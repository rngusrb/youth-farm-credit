"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { currentSession, serverSession, subscribe, type Session } from "./auth";

/** 세션을 구독한다. 로그인·로그아웃이 어디서 일어나든 이 훅을 쓰는 화면은 즉시 따라간다.
 *
 * `ready` 가 왜 필요한가 — 서버 렌더와 하이드레이션 첫 프레임에서는 스냅샷이 항상
 * `null` 이다(localStorage 를 서버가 못 읽으니까). 그 값을 '로그아웃' 으로 해석하면
 * **로그인돼 있어도 로그인 화면으로 튕긴다.** 실제로 그렇게 깨졌다.
 * 따라서 접근 통제는 반드시 `ready === true` 인 뒤에만 판단한다.
 */
export function useSession(): { session: Session | null; ready: boolean } {
  const session = useSyncExternalStore(subscribe, currentSession, serverSession);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  return { session, ready };
}
