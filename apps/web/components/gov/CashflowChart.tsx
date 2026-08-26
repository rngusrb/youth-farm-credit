"use client";

import type { MonthFlow } from "@/lib/api";
import { won } from "@/lib/format";

/** 월별 누적 잔고. 0선 아래로 내려가는 구간이 운전자금 부족이다. */
export default function CashflowChart({
  months, troughMonth,
}: { months: MonthFlow[]; troughMonth: number }) {
  const vals = months.map((m) => m.balance);
  const hi = Math.max(...vals, 0);
  const lo = Math.min(...vals, 0);
  const span = hi - lo || 1;
  const zeroPct = (hi / span) * 100;

  return (
    <figure>
      <div className="relative h-52 border-b border-l border-gov-line">
        {/* 0선 */}
        <div className="absolute inset-x-0 border-t border-dashed border-gov-ink/40"
             style={{ top: `${zeroPct}%` }} aria-hidden />
        <div className="absolute -left-1 -translate-x-full text-[10px] text-gov-ink3"
             style={{ top: `${zeroPct}%` }} aria-hidden>0</div>

        <div className="flex h-full items-stretch gap-[3px] px-1">
          {months.map((m) => {
            const up = m.balance >= 0;
            const h = (Math.abs(m.balance) / span) * 100;
            const isTrough = m.month === troughMonth;
            return (
              <div key={m.month} className="relative flex-1" title={`${m.month}월 잔고 ${won(m.balance)}`}>
                <div
                  className={`absolute w-full ${
                    isTrough ? (up ? "bg-gov-warn" : "bg-gov-point")
                             : (up ? "bg-gov-link/70" : "bg-gov-point/60")
                  }`}
                  style={
                    up
                      ? { bottom: `${100 - zeroPct}%`, height: `${h}%` }
                      : { top: `${zeroPct}%`, height: `${h}%` }
                  }
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-1 flex gap-[3px] px-1">
        {months.map((m) => (
          <div key={m.month}
               className={`flex-1 text-center text-[10px] ${
                 m.month === troughMonth ? "font-bold text-gov-point" : "text-gov-ink3"}`}>
            {m.month}
          </div>
        ))}
      </div>
      <figcaption className="mt-2 text-[11px] leading-relaxed text-gov-ink3">
        막대는 연초를 0으로 둔 누적 현금 잔고입니다. 가장 낮은 달을 강조 표시했습니다.
      </figcaption>
    </figure>
  );
}
