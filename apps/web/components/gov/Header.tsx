"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PORTAL } from "@/lib/nav";
import { ROLE_HOME } from "@/lib/auth";
import { useSession } from "@/lib/useSession";

export default function Header() {
  const path = usePathname();
  const { session, ready } = useSession();
  const home = ready && session ? ROLE_HOME[session.role] : "/app";
  return (
    <header className="no-print border-b border-gov-line bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-8 px-4 py-4">
        <Link href="/" className="flex min-h-11 items-center gap-2">
          <span className="text-[19px] font-extrabold tracking-tight text-gov-head">FarmFit</span>
          <span className="text-[12px] font-medium text-gov-ink2">농가 경영 · 여신설계</span>
        </Link>
        <nav aria-label="주요 메뉴" className="ml-auto hidden lg:block">
          <ul className="flex items-center gap-1">
            {PORTAL.map((g) => {
              const active = g.items.some((i) => path === i.href.split("#")[0]);
              return (
                <li key={g.label} className="group relative">
                  <button
                    className={`inline-flex min-h-11 items-center px-4 text-[14px] font-semibold ${
                      active ? "text-gov-head" : "text-gov-ink2 hover:text-gov-head"
                    }`}
                  >
                    {g.label}
                  </button>
                  <div className="invisible absolute right-0 top-full z-30 w-64 rounded-lg border border-gov-line bg-white p-2 shadow-lg group-hover:visible group-focus-within:visible">
                    {g.items.map((i) => (
                      <Link
                        key={i.href}
                        href={i.href}
                        className="block min-h-11 px-3 py-2 hover:bg-gov-soft"
                      >
                        <span className="block text-[13px] font-medium text-gov-ink">{i.label}</span>
                        {i.desc && (
                          <span className="block text-[12px] text-gov-ink3">{i.desc}</span>
                        )}
                      </Link>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </nav>
        <Link
          href={home}
          className="ml-auto inline-flex min-h-11 shrink-0 items-center rounded-md bg-gov-head px-4 text-[13px] font-semibold text-white hover:bg-gov-navy lg:ml-0"
        >
          {ready && session ? "업무 화면" : "진단 시작"}
        </Link>
      </div>
      {/* 좁은 화면용 가로 스크롤 메뉴 */}
      <nav aria-label="주요 메뉴 (모바일)" className="overflow-x-auto border-t border-gov-line2 lg:hidden">
        <ul className="flex min-w-max px-2">
          {PORTAL.flatMap((g) => g.items).map((i) => (
            <li key={i.href}>
              <Link href={i.href} className="inline-flex min-h-11 items-center px-3 text-[13px] text-gov-ink2">
                {i.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
