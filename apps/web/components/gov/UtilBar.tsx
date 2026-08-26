"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth";
import { useSession } from "@/lib/useSession";

/** 최상단 유틸리티 바 — 정부 포털의 관례. 글자크기 조절이 여기 붙는다. */
export default function UtilBar() {
  const router = useRouter();
  const { session } = useSession();
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem("yfc.scale") || 1);
    setScale(saved);
    document.documentElement.style.setProperty("--ui-scale", String(saved));
  }, []);

  function setUiScale(next: number) {
    const v = Math.min(1.3, Math.max(0.9, Math.round(next * 10) / 10));
    setScale(v);
    document.documentElement.style.setProperty("--ui-scale", String(v));
    window.localStorage.setItem("yfc.scale", String(v));
  }

  return (
    <div className="no-print bg-gov-navy text-[12px] text-white/90">
      <div className="mx-auto flex min-h-11 max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1">
        <span className="hidden sm:inline">농림축산식품 정책자금 상환설계 서비스</span>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-1" role="group" aria-label="글자크기 조절">
            <button onClick={() => setUiScale(scale - 0.1)} aria-label="글자 작게"
                    className="flex h-11 w-11 items-center justify-center border border-white/25 leading-none hover:bg-white/10">−</button>
            <span className="tabular w-9 text-center">{Math.round(scale * 100)}%</span>
            <button onClick={() => setUiScale(scale + 0.1)} aria-label="글자 크게"
                    className="flex h-11 w-11 items-center justify-center border border-white/25 leading-none hover:bg-white/10">+</button>
          </div>
          <span className="text-white/25">|</span>
          <Link href="/sitemap" className="inline-flex min-h-11 min-w-11 items-center justify-center px-1 hover:text-white">사이트맵</Link>
          <span className="text-white/25">|</span>
          {session ? (
            <>
              <span className="text-white">{session.org}</span>
              <button
                onClick={() => { signOut(); router.push("/"); }}
                className="inline-flex min-h-11 min-w-11 items-center justify-center px-1 hover:text-white"
              >
                로그아웃
              </button>
            </>
          ) : (
            <Link href="/login" className="inline-flex min-h-11 min-w-11 items-center justify-center px-1 hover:text-white">로그인</Link>
          )}
        </div>
      </div>
    </div>
  );
}
