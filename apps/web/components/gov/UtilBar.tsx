"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth";
import { useSession } from "@/lib/useSession";

/** 최상단 유틸리티 바 — 정부 포털의 관례.
 *
 * 글자크기 조절 버튼(± )은 뺐다. 브라우저 확대가 같은 일을 더 잘 하고,
 * 좁은 화면에서 자리만 차지했다.
 */
export default function UtilBar() {
  const router = useRouter();
  const { session, ready } = useSession();

  return (
    <div className="no-print bg-gov-navy text-[12px] text-white/90">
      <div className="mx-auto flex min-h-11 max-w-6xl items-center gap-4 px-4">
        <span className="hidden sm:inline">농림축산식품 정책자금 상환설계 서비스</span>
        <div className="ml-auto flex items-center gap-3">
          <Link href="/sitemap"
                className="inline-flex min-h-11 min-w-11 items-center justify-center px-1 hover:text-white">
            사이트맵
          </Link>
          <span className="text-white/25" aria-hidden>|</span>
          {ready && session ? (
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
            <Link href="/login"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center px-1 hover:text-white">
              로그인
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
