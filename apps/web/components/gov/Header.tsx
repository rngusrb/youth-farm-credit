"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { PORTAL } from "@/lib/nav";
import { ROLE_HOME } from "@/lib/auth";
import { useSession } from "@/lib/useSession";

export default function Header() {
  const path = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => { setMobileOpen(false); }, [path]);
  const { session, ready } = useSession();
  const home = ready && session ? ROLE_HOME[session.role] : "/app";

  /** 열려 있는 메뉴는 **하나뿐**이다.
   *
   * 사고 이력(2026-08-28): 전에는 `group-hover` 또는 `group-focus-within` 으로 열었다.
   * 버튼을 클릭하면 포커스가 남아 그 메뉴가 계속 열려 있고, 다른 것에 마우스를 올리면
   * **두 개가 동시에 떠서 겹쳤다.** 버튼에는 클릭 핸들러조차 없어서 눌러도 아무 일이
   * 일어나지 않는 가짜 버튼이었다. 상태를 하나로 두면 겹칠 수가 없다.
   */
  const [open, setOpen] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const close = useCallback(() => setOpen(null), []);

  // 페이지를 옮기면 닫는다 — 안 닫으면 새 화면 위에 떠 있는다.
  useEffect(() => {
    close();
  }, [path, close]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e: MouseEvent) => {
      if (!navRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, close]);
  return (
    <header className="no-print border-b border-gov-line bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:gap-6 sm:py-4">
        <Link href="/" className="flex min-h-11 min-w-0 flex-col items-start justify-center sm:flex-row sm:items-center sm:gap-2">
          <span className="text-[19px] font-extrabold tracking-tight text-gov-head">Seed Money</span>
          <span className="text-[12px] font-medium text-gov-ink2">농가 AI 금융 파트너</span>
        </Link>
        <nav
          ref={navRef}
          aria-label="주요 메뉴"
          className="ml-auto hidden lg:block"
          onMouseLeave={close}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) close();
          }}
        >
          <ul className="flex items-center gap-1">
            {PORTAL.map((g) => {
              const active = g.items.some((i) => path === i.href.split("#")[0]);
              return (
                <li
                  key={g.label}
                  className="relative"
                  onMouseEnter={() => setOpen(g.label)}
                >
                  <button
                    type="button"
                    aria-expanded={open === g.label}
                    aria-controls={`menu-${g.label}`}
                    // 클릭은 **열기만** 한다. 마우스를 올리면 이미 열리기 때문에,
                    // 토글로 두면 hover 로 열린 것을 클릭이 곧바로 닫아 버린다.
                    // 닫기는 바깥 클릭 · Escape · 마우스가 메뉴를 벗어날 때.
                    onClick={() => setOpen(g.label)}
                    className={`inline-flex min-h-11 items-center px-4 text-[14px] font-semibold ${
                      active ? "text-gov-head" : "text-gov-ink2 hover:text-gov-head"
                    }`}
                  >
                    {g.label}
                  </button>
                  <div
                    id={`menu-${g.label}`}
                    hidden={open !== g.label}
                    className="absolute right-0 top-full z-30 w-64 rounded-lg border border-gov-line bg-white p-2 shadow-lg"
                  >
                    {g.items.map((i) => (
                      <Link
                        key={i.href}
                        href={i.href}
                        className="block min-h-11 px-3 py-2 hover:bg-gov-soft"
                        onClick={close}
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
      <nav aria-label="주요 메뉴 (모바일)" className="border-t border-gov-line2 lg:hidden">
        <button type="button" aria-expanded={mobileOpen} aria-controls="mobile-portal-menu"
          onClick={() => setMobileOpen((v) => !v)}
          className="flex min-h-11 w-full items-center justify-between px-4 py-2 text-[14px] text-gov-ink2">
          서비스 안내 · 제도와 자료 <span>{mobileOpen ? "닫기 −" : "메뉴 +"}</span>
        </button>
        <div id="mobile-portal-menu" hidden={!mobileOpen} className="border-t border-gov-line2 px-4 py-3">
          <div className="grid gap-4 sm:grid-cols-2">
            {PORTAL.map((group) => (
              <div key={group.label}>
                <p className="mb-1 text-[13px] font-semibold text-gov-head">{group.label}</p>
                <ul>{group.items.map((i) => (
                  <li key={i.href}><Link href={i.href} onClick={() => setMobileOpen(false)}
                    aria-current={path === i.href ? "page" : undefined}
                    className="flex min-h-11 items-center rounded-md px-2 py-2 text-[14px] text-gov-ink2 hover:bg-gov-soft">{i.label}</Link></li>
                ))}</ul>
              </div>
            ))}
          </div>
        </div>
      </nav>
    </header>
  );
}
