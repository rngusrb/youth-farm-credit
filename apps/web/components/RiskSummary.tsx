import type { Scenario } from "@/lib/api";
import { pct } from "@/lib/format";
import AssumedBadge from "./AssumedBadge";

/** 위험 요약 — 연간 부족확률, 2년연속 위기확률, 최초 위험연차. */
export default function RiskSummary({
  scenario,
  sigmaSource,
  personalized,
}: {
  scenario: Scenario;
  sigmaSource: "ASSUMED" | "MEASURED";
  personalized: boolean;
}) {
  const items = [
    {
      label: "연간 상환부족 확률",
      value: pct(scenario.annual_short_prob),
      hint: "상환기 한 해를 무작위로 뽑았을 때 상환액을 채우지 못할 확률",
      danger: scenario.annual_short_prob > 0.2,
      volatile: true,
    },
    {
      label: "2년 연속 위기 확률",
      value: pct(scenario.crisis_prob),
      hint: "1년 부족은 저축·유예로 흡수 가능하지만, 연속 부족은 돌려막기 진입을 뜻합니다",
      danger: scenario.crisis_prob > 0.2,
      volatile: true,
    },
    {
      label: "최초 위험 연차",
      value: scenario.first_risk_year ? `${scenario.first_risk_year}년차` : "없음",
      hint: "연간 부족확률이 20%를 처음 넘는 시점",
      danger: scenario.first_risk_year !== null,
      volatile: false,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map((it) => (
        <div key={it.label} className="rounded-xl border border-ink-800 bg-ink-900 p-4">
          <div className="text-xs text-slate-500">{it.label}</div>
          <div
            className={`tabular mt-1 text-2xl font-semibold ${
              it.danger ? "text-signal-danger" : "text-slate-100"
            }`}
          >
            {it.value}
            {it.volatile && (
              <AssumedBadge source={sigmaSource} personalized={personalized} />
            )}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-600">{it.hint}</p>
        </div>
      ))}
    </div>
  );
}
