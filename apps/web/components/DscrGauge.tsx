"use client";

import { ratio } from "@/lib/format";

type Props = {
  median: number;
  p10: number;
  worst: number;
  worstYear: number;
  target: number;
};

const MAX = 3;
const clamp = (v: number) => Math.max(0, Math.min(v, MAX));
const toPct = (v: number) => (clamp(v) / MAX) * 100;

/** DSCR 게이지 — 중앙값·하위10%, 1.0 기준선. */
export default function DscrGauge({ median, p10, worst, worstYear, target }: Props) {
  const danger = worst < 1;
  return (
    <div>
      {/* 원금균등은 해마다 상환액이 달라 중앙값만 보면 최악 구간이 가려진다.
          가장 무거운 해를 주 지표로 세우고 나머지는 보조로 둔다. */}
      <div className="mb-3 flex flex-wrap items-baseline gap-x-7 gap-y-2">
        <div>
          <div className="text-xs text-paper-ink3">{worstYear}년차 — 가장 무거운 해</div>
          <div
            className={`tabular text-3xl font-semibold ${
              danger ? "text-paper-danger" : "text-paper-ink"
            }`}
          >
            {ratio(worst)}
          </div>
        </div>
        <div>
          <div className="text-xs text-paper-ink3">대출을 갚는 기간의 중간값</div>
          <div className="tabular text-xl font-medium text-paper-ink2">{ratio(median)}</div>
        </div>
        <div>
          <div className="text-xs text-paper-ink3">하위 10%</div>
          <div className="tabular text-xl font-medium text-paper-ink2">{ratio(p10)}</div>
        </div>
      </div>

      <div className="relative h-3 w-full overflow-hidden rounded-full bg-paper-soft">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-paper-ink3"
          style={{ width: `${toPct(p10)}%` }}
        />
        <div
          className={`absolute inset-y-0 w-1 ${danger ? "bg-paper-danger" : "bg-paper-ink3"}`}
          style={{ left: `calc(${toPct(worst)}% - 2px)` }}
        />
        <div
          className="absolute inset-y-0 w-px bg-paper-ink"
          style={{ left: `${toPct(1)}%` }}
        />
        <div
          className="absolute inset-y-0 w-px bg-paper-accent"
          style={{ left: `${toPct(target)}%` }}
        />
      </div>
      {/* 눈금 숫자는 마커 바로 아래, 설명은 겹치지 않게 한 줄 내려서 */}
      <div className="relative mt-1.5 h-4 text-[12px] text-paper-ink3">
        <span className="absolute left-0">0</span>
        <span
          className="tabular absolute -translate-x-1/2 font-medium text-paper-ink"
          style={{ left: `${toPct(1)}%` }}
        >
          1.0
        </span>
        <span
          className="tabular absolute -translate-x-1/2 font-medium text-paper-accent"
          style={{ left: `${toPct(target)}%` }}
        >
          {target.toFixed(2)}
        </span>
        <span className="absolute right-0">{MAX.toFixed(1)}+</span>
      </div>
      <div className="mt-1 flex gap-4 text-[12px] text-paper-ink3">
        <span>
          <b className="font-medium text-paper-ink">1.0</b> 대출을 갚을 가능선
        </span>
        <span>
          <b className="font-medium text-paper-accent">{target.toFixed(2)}</b> 은행 권장
        </span>
      </div>
    </div>
  );
}
