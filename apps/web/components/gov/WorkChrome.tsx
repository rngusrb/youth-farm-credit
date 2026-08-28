"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BANK, FARMER } from "@/lib/nav";
import { ROLE_LABEL } from "@/lib/auth";
import { useSession } from "@/lib/useSession";

/** 업무 영역 크롬 — 역할 전환 탭 + 좌측 메뉴.
 *
 * 같은 엔진의 결과를 농가와 금융기관에 서로 다른 관점으로 낸다.
 * 정부 사이트의 「개인 / 기업」 탭과 같은 자리다.
 */
export default function WorkChrome({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { session, ready } = useSession();

  const isReport = path.startsWith("/result/");
  // 리포트는 양쪽에서 다 열린다. 역할로 메뉴를 고르고 리다이렉트는 걸지 않는다.
  const isBank = isReport ? session?.role === "bank" : path.startsWith("/bank");

  useEffect(() => {
    // 하이드레이션 전에는 세션이 null 로 보인다 — 그때 판단하면 로그인해도 튕긴다.
    if (!ready) return;
    if (!session) {
      router.replace(`/login?next=${encodeURIComponent(path)}`);
      return;
    }
    if (isReport) return; // 리포트는 두 역할 모두 볼 수 있다
    // 계정이 역할을 정한다. 농가 계정으로 심사 화면에 들어갈 수 없다.
    if (isBank && session.role !== "bank") router.replace("/app");
    if (!isBank && session.role !== "farmer") router.replace("/bank");
  }, [path, router, session, isBank, ready, isReport]);

  if (!ready) return null;
  if (!session) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-center text-[14px] text-gov-ink2">
        로그인 화면으로 이동합니다…
      </div>
    );
  }

  const menu = isBank ? BANK : FARMER;

  return (
    <div className="border-b border-gov-line bg-white">
      {/* 역할 전환 */}
      <div className="border-b border-gov-line bg-gov-sunk">
        <div className="mx-auto flex max-w-6xl items-stretch px-4">
          <div className="-mb-px border-b-2 border-gov-head bg-white px-5 py-3">
            <span className="block text-[14px] font-bold text-gov-head">
              {session.role === "bank" ? "금융기관용" : "농가용"}
            </span>
            <span className="hidden text-[12px] text-gov-ink3 sm:block">
              {session.role === "bank"
                ? "상환능력 분석과 여신 설계"
                : "내 경영 상태와 권장 차입 규모"}
            </span>
          </div>
          <div className="ml-auto flex items-center text-[12px] text-gov-ink3">
            {ROLE_LABEL[session.role]} · {session.org} · {session.name}
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-6xl gap-7 px-4">
        <nav aria-label="업무 메뉴" className="hidden w-52 shrink-0 border-r border-gov-line2 py-6 lg:block">
          <ul>
            {menu.map((i) => {
              const active = isReport
                ? i.href.endsWith("/reports")
                : i.href === "/app" || i.href === "/bank"
                  ? path === i.href
                  : path.startsWith(i.href);
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    aria-current={active ? "page" : undefined}
                    className={`block border-l-[3px] py-2.5 pl-3 pr-2 ${
                      active
                        ? "border-gov-head bg-gov-soft font-semibold text-gov-head"
                        : "border-transparent text-gov-ink2 hover:bg-gov-sunk hover:text-gov-ink"
                    }`}
                  >
                    <span className="block text-[13px] leading-tight">{i.label}</span>
                    {i.desc && <span className="block text-[12px] text-gov-ink3">{i.desc}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 flex-1 py-6">
          {/* 좁은 화면용 */}
          <nav aria-label="업무 메뉴 (모바일)" className="mb-5 overflow-x-auto lg:hidden">
            <ul className="flex min-w-max gap-1 border-b border-gov-line2">
              {menu.map((i) => {
                const active = isReport
                  ? i.href.endsWith("/reports")
                  : i.href === "/app" || i.href === "/bank"
                    ? path === i.href : path.startsWith(i.href);
                return (
                  <li key={i.href}>
                    <Link href={i.href}
                          className={`-mb-px flex min-h-11 min-w-11 items-center justify-center border-b-2 px-3 text-[13px] ${
                            active ? "border-gov-head font-semibold text-gov-head"
                                   : "border-transparent text-gov-ink2"}`}>
                      {i.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          {children}
        </div>
      </div>
    </div>
  );
}
