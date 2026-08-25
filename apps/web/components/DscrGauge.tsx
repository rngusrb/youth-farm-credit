"use client";

import { ratio } from "@/lib/format";

type Props = {
  median: number;
  p10: number;
  target: number;
};

const MAX = 3;
const clamp = (v: number) => Math.max(0, Math.min(v, MAX));
const toPct = (v: number) => (clamp(v) / MAX) * 100;

/** DSCR 게이지 — 중앙값·하위10%, 1.0 기준선. */
export default function DscrGauge({ median, p10, target }: Props) {
  const danger = median < 1;
  return (
    <div>
      <div className="mb-3 flex items-baseline gap-6">
        <div>
          <div className="text-xs text-slate-500">DSCR 중앙값</div>
          <div
            className={`tabular text-3xl font-semibold ${
              danger ? "text-signal-danger" : "text-slate-100"
            }`}
          >
            {ratio(median)}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-500">하위 10%</div>
          <div className="tabular text-xl font-medium text-slate-400">{ratio(p10)}</div>
        </div>
      </div>

      <div className="relative h-3 w-full overflow-hidden rounded-full bg-ink-800">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-slate-600"
          style={{ width: `${toPct(p10)}%` }}
        />
        <div
          className={`absolute inset-y-0 w-1 ${danger ? "bg-signal-danger" : "bg-signal-calm"}`}
          style={{ left: `calc(${toPct(median)}% - 2px)` }}
        />
        <div
          className="absolute inset-y-0 w-px bg-slate-300"
          style={{ left: `${toPct(1)}%` }}
        />
        <div
          className="absolute inset-y-0 w-px bg-signal-warn"
          style={{ left: `${toPct(target)}%` }}
        />
      </div>
      {/* 눈금 설명은 실제 마커 위치에 맞춰 세운다 */}
      <div className="relative mt-2 h-8 text-[11px] text-slate-500">
        <span className="absolute left-0">0</span>
        <span
          className="absolute -translate-x-1/2 whitespace-nowrap text-slate-300"
          style={{ left: `${toPct(1)}%` }}
        >
          1.0
          <span className="block text-slate-500">상환 가능선</span>
        </span>
        <span
          className="absolute -translate-x-1/2 whitespace-nowrap text-signal-warn"
          style={{ left: `${toPct(target)}%`, top: "1.15rem" }}
        >
          {target.toFixed(2)} 권장
        </span>
        <span className="absolute right-0">{MAX.toFixed(1)}+</span>
      </div>
    </div>
  );
}
