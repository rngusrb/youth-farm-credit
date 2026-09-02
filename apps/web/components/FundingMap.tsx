"use client";

import type { FundingMapResult } from "@/lib/api";
import { pct, won } from "@/lib/format";

/** 25년 자금지도.
 *
 * 이 서비스의 핵심 주장 — "5년 거치 뒤 6년차에 원금 상환이 한 번에 시작된다" — 이
 * 지금까지 숫자로만 있었다. 그 한 문장을 한 장으로 만든다.
 *
 * **화면은 계산하지 않는다.** 막대 높이와 위치만 값에서 뽑고, 숫자는 엔진이 준 것을 그대로 쓴다.
 */
export default function FundingMap({ data }: { data: FundingMapResult }) {
  const years = data.years;
  if (years.length === 0) return null;

  // viewBox 폭을 **최소 표시 폭과 같게** 맞춘다. 720 좌표계를 560px 로 줄여 그리면
  // 12px 로 적은 글씨가 실제로는 9px 로 보인다 — 검사는 통과하는데 눈에는 안 보인다.
  // 2026-09-02 ui_check 가 축 라벨 9~10px 를 잡았고, 폰트만 키우는 건 속임수라
  // 좌표계 자체를 1:1 로 맞췄다.
  const W = 600;
  const H = 260;
  const PAD = { top: 18, right: 12, bottom: 32, left: 68 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const maxVal = Math.max(...years.map((y) => Math.max(y.due, y.capacity)));
  const barW = plotW / years.length;
  const x = (i: number) => PAD.left + i * barW;
  const y = (v: number) => PAD.top + plotH - (v / maxVal) * plotH;

  const graceEnd = data.grace_years;
  const risky = years.filter((p) => p.shortfall_prob >= 0.2).map((p) => p.year);

  return (
    <figure className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${data.term_years}년 자금지도. 거치 ${graceEnd}년, ${
          risky.length ? `${risky[0]}년차부터 부족 위험` : "부족 위험 구간 없음"
        }.`}
        className="w-full min-w-[600px]"
      >
        {/* 거치 구간 음영 — 이자만 내는 기간 */}
        <rect
          x={PAD.left} y={PAD.top}
          width={barW * graceEnd} height={plotH}
          className="fill-gov-sunk"
        />
        <text x={PAD.left + 6} y={PAD.top + 14} className="fill-gov-ink3 text-[12px]">
          거치 {graceEnd}년 · 이자만
        </text>

        {/* 상환여력 선 (중앙값) */}
        <polyline
          fill="none"
          strokeWidth={1.5}
          className="stroke-gov-link"
          points={years.map((p, i) => `${x(i) + barW / 2},${y(p.capacity)}`).join(" ")}
        />

        {/* 연도별 상환액 막대 */}
        {years.map((p, i) => (
          <rect
            key={p.year}
            x={x(i) + barW * 0.18}
            y={y(p.due)}
            width={barW * 0.64}
            height={PAD.top + plotH - y(p.due)}
            className={
              p.shortfall_prob >= 0.2
                ? "fill-gov-warn"
                : p.is_grace
                  ? "fill-gov-line"
                  : "fill-gov-head"
            }
          >
            <title>
              {p.year}년차 · 상환 {won(p.due)} · 상환여력 {won(p.capacity)} · 그 해 부족확률{" "}
              {pct(p.shortfall_prob)}
            </title>
          </rect>
        ))}

        {/* 거치 종료 경계 */}
        <line
          x1={x(graceEnd)} y1={PAD.top} x2={x(graceEnd)} y2={PAD.top + plotH}
          strokeDasharray="3 3" className="stroke-gov-ink3"
        />

        {/* 축 */}
        <line
          x1={PAD.left} y1={PAD.top + plotH} x2={W - PAD.right} y2={PAD.top + plotH}
          className="stroke-gov-line"
        />
        {[0, maxVal / 2, maxVal].map((v, i) => (
          <text key={i} x={PAD.left - 6} y={y(v) + 3} textAnchor="end"
                className="fill-gov-ink3 text-[12px]">
            {Math.round(v / 10_000).toLocaleString()}만
          </text>
        ))}
        {years.filter((_, i) => i % 5 === 0 || i === years.length - 1).map((p) => (
          <text key={p.year} x={x(p.year - 1) + barW / 2} y={H - 10} textAnchor="middle"
                className="fill-gov-ink3 text-[12px]">
            {p.year}년
          </text>
        ))}
      </svg>

      <figcaption className="mt-2 space-y-1">
        <div className="flex flex-wrap gap-3 text-[12px] text-gov-ink2">
          <span><span className="mr-1 inline-block h-2 w-3 bg-gov-line align-middle" />거치(이자만)</span>
          <span><span className="mr-1 inline-block h-2 w-3 bg-gov-head align-middle" />원금+이자</span>
          <span><span className="mr-1 inline-block h-2 w-3 bg-gov-warn align-middle" />그 해 부족확률 20%↑</span>
          <span><span className="mr-1 inline-block h-0.5 w-3 bg-gov-link align-middle" />상환여력(중앙값)</span>
        </div>
      </figcaption>
    </figure>
  );
}
