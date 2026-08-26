"use client";

import { useEffect, useState } from "react";
import { loadProfile, type FarmProfile } from "./profile";

/** 업무 화면 공통 — 저장된 농가 정보를 읽는다.
 *
 * ready 가 false 인 동안은 아무것도 그리지 않는다. localStorage 는 서버에서
 * 읽을 수 없어서, 판단을 먼저 하면 "정보 없음" 화면이 한 번 깜빡인다.
 */
export function useFarm(): { profile: FarmProfile | null; ready: boolean } {
  const [profile, setProfile] = useState<FarmProfile | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setProfile(loadProfile());
    setReady(true);
  }, []);
  return { profile, ready };
}
