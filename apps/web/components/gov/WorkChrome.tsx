"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BANK, FARMER } from "@/lib/nav";
import { currentSession, switchRole, type Session } from "@/lib/auth";

/** 업무 영역 크롬 — 역할 전환 탭 + 좌측 메뉴.
 *
 * 같은 엔진의 결과를 농가와 금융기관에 서로 다른 관점으로 낸다.
 * 정부 사이트의 「개인 / 기업」 탭과 같은 자리다.
 */
export default function WorkChrome({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const s = currentSession();
    setSession(s);
    setReady(true);
    if (!s) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [path, router]);

  if (!ready) return null;
  if (!session) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-center text-[14px] text-gov-ink2">
        로그인 화면으로 이동합니다…
      </div>
    );
  }

  const isBank = path.startsWith("/bank");
  const menu = isBank ? BANK : FARMER;

  function go(role: "farmer" | "bank") {
    switchRole(role);
    setSession(currentSession());
    router.push(role === "bank" ? "/bank" : "/app");
  }

  return (
    <div className="border-b border-gov-line bg-white">
      {/* 역할 전환 */}
      <div className="border-b border-gov-line bg-gov-sunk">
        <div className="mx-auto flex max-w-6xl items-stretch px-4">
          {([
            ["farmer", "농가용", "내 경영 상태와 감당 가능한 차입"],
            ["bank", "금융기관용", "상환능력 분석과 여신 설계"],
          ] as const).map(([role, label, desc]) => {
            const on = isBank ? role === "bank" : role === "farmer";
            return (
              <button
                key={role}
                onClick={() => go(role)}
                aria-current={on ? "true" : undefined}
                className={`-mb-px border-b-2 px-5 py-3 text-left ${
                  on
                    ? "border-gov-head bg-white text-gov-head"
                    : "border-transparent text-gov-ink3 hover:text-gov-ink2"
                }`}
              >
                <span className="block text-[14px] font-bold">{label}</span>
                <span className="hidden text-[11px] sm:block">{desc}</span>
              </button>
            );
          })}
          <div className="ml-auto flex items-center text-[12px] text-gov-ink3">
            {session.org} · {session.name}
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-6xl gap-7 px-4">
        <nav aria-label="업무 메뉴" className="hidden w-52 shrink-0 border-r border-gov-line2 py-6 lg:block">
          <ul>
            {menu.map((i) => {
              const active = i.href === "/app" || i.href === "/bank"
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
                    {i.desc && <span className="block text-[11px] text-gov-ink3">{i.desc}</span>}
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
                const active = i.href === "/app" || i.href === "/bank"
                  ? path === i.href : path.startsWith(i.href);
                return (
                  <li key={i.href}>
                    <Link href={i.href}
                          className={`-mb-px block border-b-2 px-3 py-2 text-[13px] ${
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
