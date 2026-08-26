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
  sigmaSource: Diagnosis["sigma_source"];
  assumedShare: number | null;
  ciScope: Diagnosis["sigma_ci_scope"];
  sigmaIdiosyncratic: number;
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
  assumedShare,
  ciScope,
  sigmaIdiosyncratic,
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
    <section className="rounded-xl border border-paper-rule bg-paper-panel p-5">
      <h3 className="text-sm font-semibold text-paper-ink">
        {personalized ? "내 소득 이력 기준 변동성" : "변동성을 모른다는 사실의 값어치"}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-paper-ink3">
        소득 변동성 σ는{" "}
        {personalized ? (
          <span className="text-paper-ok">
            입력하신 소득 이력으로 계산한 {sigma.toFixed(2)}
            {sigmaCi && ` (95% 구간 ${sigmaCi[0].toFixed(2)}~${sigmaCi[1].toFixed(2)})`}
          </span>
        ) : sigmaSource === "ASSUMED" ? (
          <span className="text-paper-danger">
            아직 실측되지 않은 가정값({sigma.toFixed(2)})
          </span>
        ) : (
          <span className="text-paper-ok">{sigma.toFixed(2)}</span>
        )}
        입니다.{" "}
        {!personalized && typeof sigmaCommon === "number" && sigmaCommon > 0 && (
          <>
            이 중 시장이 함께 겪는 부분{" "}
            <span className="text-paper-ok">{sigmaCommon.toFixed(2)}</span>은
            농촌진흥청 소득조사 시계열에서 실측했고, 농가 고유 변동{" "}
            <span className="text-paper-accent">
              {sigmaIdiosyncratic.toFixed(2)}
            </span>
            은 가정값입니다 — <b className="text-paper-ink">분산 기준으로 보면
            {" "}{Math.round((assumedShare ?? 0) * 100)}%가 가정</b>입니다.
          </>
        )}
        {" "}σ를 어떻게 잡느냐에 따라 권장 한도({won(recommended)})의 위험이 이만큼
        달라집니다.
      </p>
      {sigmaReference && !personalized && (
        <p className="mt-1.5 text-[12px] leading-relaxed text-paper-ink3">
          {sigmaReference}
        </p>
      )}
      {sigmaNote && (
        <p className="mt-2 rounded-lg border border-paper-ok/30 bg-paper-ok/5 px-3 py-2 text-xs leading-relaxed text-paper-ink2">
          {sigmaNote}
        </p>
      )}

      <div className="mt-4 h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid stroke="#e4dfd5" vertical={false} />
            <ReferenceArea
              y1={0}
              y2={maxCrisisProb}
              fill="#29685a"
              fillOpacity={0.08}
            />
            <XAxis
              dataKey="sigma"
              tick={{ fill: "#61666e", fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: "#e4dfd5" }}
              tickFormatter={(v) => `σ ${Number(v).toFixed(2)}`}
            />
            <YAxis
              domain={[0, 1]}
              tick={{ fill: "#61666e", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
            />
            <Tooltip
              contentStyle={{
                background: "#ffffff",
                border: "1px solid #e4dfd5",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(v) => `σ = ${Number(v).toFixed(2)}`}
              formatter={(v) => [pct(Number(v)), "2년연속 위기확률"]}
            />
            <ReferenceLine
              y={maxCrisisProb}
              stroke="#29685a"
              strokeDasharray="4 4"
              label={{
                value: `목표 ${pct(maxCrisisProb)}`,
                position: "insideTopLeft",
                fill: "#29685a",
                fontSize: 12,
              }}
            />
            <ReferenceLine
              x={sigma}
              stroke="#9a6216"
              strokeDasharray="2 4"
              label={{
                value: "적용 σ",
                position: "top",
                fill: "#9a6216",
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="crisis"
              stroke="#a8442b"
              strokeWidth={2}
              dot={{ r: 3, fill: "#a8442b" }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-paper-rule bg-paper-sunk p-3">
          <dt className="text-[12px] text-paper-ink3">
            σ {data[0].sigma.toFixed(2)}~{data[data.length - 1].sigma.toFixed(2)} 구간의 위기확률
          </dt>
          <dd className="tabular mt-0.5 text-lg font-semibold text-paper-ink">
            {pct(uncertainty.crisis_prob_low)} ~ {pct(uncertainty.crisis_prob_high)}
          </dd>
        </div>
        <div className="rounded-lg border border-paper-rule bg-paper-sunk p-3">
          <dt className="text-[12px] text-paper-ink3">
            같은 구간의 상환위험 기준 한도
          </dt>
          <dd className="tabular mt-0.5 text-lg font-semibold text-paper-ink">
            {won(uncertainty.risk_limit_low)} ~ {won(uncertainty.risk_limit_high)}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-xs leading-relaxed text-paper-ink3">
        {breakEven === null ? (
          <>
            가장 낙관적인 σ({data[0].sigma.toFixed(2)})에서도 권장 한도의 위기확률이
            목표 {pct(maxCrisisProb)}를 넘습니다. 변동성을 어떻게 잡든 이 조건에서
            권장 한도는 부담스러운 금액입니다.
          </>
        ) : (
          <>
            분기점은 σ ={" "}
            <span className="tabular font-semibold text-paper-ink2">
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
