"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Diagnosis } from "@/lib/api";
import { pct, won } from "@/lib/format";

type Props = {
  uncertainty: NonNullable<Diagnosis["uncertainty"]>;
  sigma: number;
  sigmaSource: "ASSUMED" | "MEASURED";
  personalized: boolean;
  sigmaNote: string | null;
  sigmaCi: [number, number] | null;
  sigmaCommon: number | null;
  sigmaReference: string | null;
  maxCrisisProb: number;
  recommended: number;
};

/**
 * σ 에는 아직 가정이 섞여 있다(농가 고유 성분). 그래서 결과를 점 하나로 내놓지
 * 않고, 적용 σ 주변에서 위험이 어떻게 움직이는지 함께 보여준다.
 * 격자는 작목별 σ 의 배수라 축 범위가 작목마다 달라진다.
 */
export default function SigmaBand({
  uncertainty,
  sigma,
  sigmaSource,
  personalized,
  sigmaNote,
  sigmaCi,
  sigmaCommon,
  sigmaReference,
  maxCrisisProb,
  recommended,
}: Props) {
  const data = uncertainty.sigma_grid.map((p) => ({
    sigma: p.sigma,
    crisis: p.crisis_prob,
    limit: p.risk_limit,
  }));
  const breakEven = uncertainty.break_even_sigma;

  return (
    <section className="rounded-xl border border-ink-800 bg-ink-900 p-5">
      <h3 className="text-sm font-semibold text-slate-200">
        {personalized ? "내 소득 이력 기준 변동성" : "변동성을 모른다는 사실의 값어치"}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        소득 변동성 σ는{" "}
        {personalized ? (
          <span className="text-signal-ok">
            입력하신 소득 이력으로 계산한 {sigma.toFixed(2)}
            {sigmaCi && ` (95% 구간 ${sigmaCi[0].toFixed(2)}~${sigmaCi[1].toFixed(2)})`}
          </span>
        ) : sigmaSource === "ASSUMED" ? (
          <span className="text-signal-warn">
            아직 실측되지 않은 가정값({sigma.toFixed(2)})
          </span>
        ) : (
          <span className="text-signal-ok">{sigma.toFixed(2)}</span>
        )}
        입니다.{" "}
        {!personalized && typeof sigmaCommon === "number" && sigmaCommon > 0 && (
          <>
            이 중 시장이 함께 겪는 부분{" "}
            <span className="text-signal-ok">{sigmaCommon.toFixed(2)}</span>은
            농촌진흥청 소득조사 시계열에서 실측했고, 농가 고유 변동{" "}
            <span className="text-signal-warn">
              {Math.sqrt(Math.max(sigma ** 2 - sigmaCommon ** 2, 0)).toFixed(2)}
            </span>
            만 아직 가정값입니다.
          </>
        )}
        {" "}σ를 어떻게 잡느냐에 따라 권장 한도({won(recommended)})의 위험이 이만큼
        달라집니다.
      </p>
      {sigmaReference && !personalized && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">
          {sigmaReference}
        </p>
      )}
      {sigmaNote && (
        <p className="mt-2 rounded-lg border border-signal-ok/25 bg-signal-ok/5 px-3 py-2 text-xs leading-relaxed text-slate-300">
          {sigmaNote}
        </p>
      )}

      <div className="mt-4 h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid stroke="#252f44" vertical={false} />
            <ReferenceArea
              y1={0}
              y2={maxCrisisProb}
              fill="#2fa9a0"
              fillOpacity={0.08}
            />
            <XAxis
              dataKey="sigma"
              tick={{ fill: "#7c8aa3", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#252f44" }}
              tickFormatter={(v) => `σ ${Number(v).toFixed(2)}`}
            />
            <YAxis
              domain={[0, 1]}
              tick={{ fill: "#7c8aa3", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
            />
            <Tooltip
              contentStyle={{
                background: "#111726",
                border: "1px solid #252f44",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(v) => `σ = ${Number(v).toFixed(2)}`}
              formatter={(v) => [pct(Number(v)), "2년연속 위기확률"]}
            />
            <ReferenceLine
              y={maxCrisisProb}
              stroke="#2fa9a0"
              strokeDasharray="4 4"
              label={{
                value: `목표 ${pct(maxCrisisProb)}`,
                position: "insideTopLeft",
                fill: "#2fa9a0",
                fontSize: 11,
              }}
            />
            <ReferenceLine
              x={sigma}
              stroke="#f0a92c"
              strokeDasharray="2 4"
              label={{
                value: "적용 σ",
                position: "top",
                fill: "#f0a92c",
                fontSize: 11,
              }}
            />
            <Line
              type="monotone"
              dataKey="crisis"
              stroke="#e2564d"
              strokeWidth={2}
              dot={{ r: 3, fill: "#e2564d" }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-ink-800 bg-ink-950/50 p-3">
          <dt className="text-[11px] text-slate-500">
            σ {data[0].sigma.toFixed(2)}~{data[data.length - 1].sigma.toFixed(2)} 구간의 위기확률
          </dt>
          <dd className="tabular mt-0.5 text-lg font-semibold text-slate-200">
            {pct(uncertainty.crisis_prob_low)} ~ {pct(uncertainty.crisis_prob_high)}
          </dd>
        </div>
        <div className="rounded-lg border border-ink-800 bg-ink-950/50 p-3">
          <dt className="text-[11px] text-slate-500">
            같은 구간의 상환위험 기준 한도
          </dt>
          <dd className="tabular mt-0.5 text-lg font-semibold text-slate-200">
            {won(uncertainty.risk_limit_low)} ~ {won(uncertainty.risk_limit_high)}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        {breakEven === null ? (
          <>
            가장 낙관적인 σ({data[0].sigma.toFixed(2)})에서도 권장 한도의 위기확률이
            목표 {pct(maxCrisisProb)}를 넘습니다. 변동성을 어떻게 잡든 이 조건에서
            권장 한도는 부담스러운 금액입니다.
          </>
        ) : (
          <>
            분기점은 σ ={" "}
            <span className="tabular font-semibold text-slate-300">
              {breakEven.toFixed(2)}
            </span>
            입니다. 실제 변동성이 이보다 작으면 권장 한도가 목표 위험 안에 들어오고,
            크면 벗어납니다.
          </>
        )}{" "}
        {!personalized &&
          "지난 3개년 이상의 농업소득을 입력하면 남은 가정(농가 고유 변동)도 사라집니다."}
      </p>
    </section>
  );
}
