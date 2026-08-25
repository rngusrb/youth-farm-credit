"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { manwon } from "@/lib/format";

type Props = {
  schedule: number[];
  capacity: number;
  graceYears: number;
  firstRiskYear: number | null;
  height?: number;
};

/**
 * 시그니처 요소 — 상환 절벽.
 * 거치기간의 낮은 막대, 상환 개시 연차의 수직 상승, 그리고 상환여력 기준선.
 */
export default function CliffChart({
  schedule,
  capacity,
  graceYears,
  firstRiskYear,
  height = 260,
}: Props) {
  const data = schedule.map((due, i) => ({
    year: i + 1,
    due,
    phase: i < graceYears ? "grace" : "amort",
  }));

  // 만원 단위로 떨어지는 눈금을 직접 고른다 (자동 눈금은 750만·2,250만처럼 읽기 나쁘다).
  const peak = Math.max(capacity, ...schedule, 1);
  const step =
    [2_500_000, 5_000_000, 10_000_000, 20_000_000, 50_000_000, 100_000_000].find(
      (s) => peak / s <= 5,
    ) ?? 200_000_000;
  const top = Math.ceil(peak / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 24, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid stroke="#252f44" vertical={false} />
          <XAxis
            dataKey="year"
            tick={{ fill: "#7c8aa3", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#252f44" }}
            interval={1}
            tickFormatter={(y) => `${y}`}
          />
          <YAxis
            tick={{ fill: "#7c8aa3", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={64}
            domain={[0, top]}
            ticks={ticks}
            tickFormatter={(v) => (v === 0 ? "0" : manwon(Number(v)))}
          />
          <Tooltip
            cursor={{ fill: "#1a2233" }}
            contentStyle={{
              background: "#111726",
              border: "1px solid #252f44",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={(y) => `${y}년차`}
            formatter={(v) => [manwon(Number(v)), "연 상환액"]}
          />
          <ReferenceLine
            y={capacity}
            stroke="#5b8def"
            strokeDasharray="4 4"
            label={{
              value: `상환여력 ${manwon(capacity)}`,
              position: "insideTopLeft",
              fill: "#5b8def",
              fontSize: 11,
            }}
          />
          {firstRiskYear && (
            <ReferenceLine
              x={firstRiskYear}
              stroke="#e2564d"
              strokeDasharray="2 4"
              label={{
                value: `${firstRiskYear}년차 위험`,
                position: "top",
                fill: "#e2564d",
                fontSize: 11,
                dy: -6,
              }}
            />
          )}
          <Bar dataKey="due" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell
                key={d.year}
                fill={
                  d.phase === "grace"
                    ? "#3a465f"
                    : d.due > capacity
                      ? "#e2564d"
                      : "#5b8def"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
