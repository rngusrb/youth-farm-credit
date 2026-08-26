"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/nav";
import Icon from "./Icon";

export default function Sidebar() {
  const path = usePathname();
  // 리포트는 '문서' 화면이라 사이드바를 접는다 — 인쇄물에 앱 크롬이 끼면 안 된다.
  if (path.startsWith("/result/")) return null;

  return (
    <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-ink-800 bg-ink-900/40 lg:flex">
      <Link href="/" className="flex items-baseline gap-2 px-5 py-5">
        <span className="font-serif text-[15px] font-bold tracking-tight">청년농 여신 설계</span>
      </Link>

      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map((item) => {
          const active =
            item.href === "/" ? path === "/" : path.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`group flex items-start gap-3 rounded-lg px-3 py-2.5 transition ${
                active
                  ? "bg-ink-800 text-slate-100"
                  : "text-slate-400 hover:bg-ink-800/50 hover:text-slate-200"
              }`}
            >
              <Icon
                name={item.icon}
                className={`mt-0.5 h-[18px] w-[18px] shrink-0 ${
                  active ? "text-signal-warn" : "text-slate-500 group-hover:text-slate-400"
                }`}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium leading-tight">{item.label}</span>
                <span className="block truncate text-[11px] leading-tight text-slate-500">
                  {item.desc}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 text-[11px] leading-relaxed text-slate-600">
        <a
          href="/methodology.html"
          target="_blank"
          rel="noreferrer"
          className="text-slate-500 underline decoration-ink-600 underline-offset-2 hover:text-slate-300"
        >
          숫자의 계보 ↗
        </a>
        <p className="mt-2">부도 예측·신용평가·대출 알선을 하지 않습니다.</p>
      </div>
    </aside>
  );
}
