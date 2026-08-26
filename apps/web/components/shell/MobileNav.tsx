"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/nav";
import Icon from "./Icon";

/** 좁은 화면용 하단 바. 사이드바와 같은 목적지를 아이콘으로만 낸다. */
export default function MobileNav() {
  const path = usePathname();
  if (path.startsWith("/result/")) return null;

  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-20 flex border-t border-ink-800 bg-ink-950/95 backdrop-blur lg:hidden">
      {NAV.map((item) => {
        const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-1 py-2 text-[10px] ${
              active ? "text-signal-warn" : "text-slate-500"
            }`}
          >
            <Icon name={item.icon} className="h-[18px] w-[18px]" />
            <span className="truncate px-0.5">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
