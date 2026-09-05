import type { Diagnosis, Scenario } from "@/lib/api";
import { pct } from "@/lib/format";
import AssumedBadge from "./AssumedBadge";

/** 위험 요약 — 연간 부족확률, 2년연속 위기확률, 최초 위험연차. */
export default function RiskSummary({
  scenario,
  sigmaSource,
  assumedShare,
}: {
  scenario: Scenario;
  sigmaSource: Diagnosis["sigma_source"];
  assumedShare: number | null;
}) {
  const items = [
    {
      label: "연간 갚을 돈이 모자랄 확률",
      value: pct(scenario.annual_short_prob),
      hint: "상환기 한 해를 무작위로 뽑았을 때 갚을 돈을 채우지 못할 확률",
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
      label: "처음 돈이 부족할 수 있는 해",
      value: scenario.first_risk_year ? `${scenario.first_risk_year}년차` : "없음",
      hint: "연간 부족확률이 20%를 처음 넘는 시점",
      danger: scenario.first_risk_year !== null,
      volatile: false,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map((it) => (
        <div key={it.label} className="rounded-xl border border-paper-rule bg-paper-panel p-4">
          <div className="text-xs text-paper-ink3">{it.label}</div>
          <div
            className={`tabular mt-1 text-2xl font-semibold ${
              it.danger ? "text-paper-danger" : "text-paper-ink"
            }`}
          >
            {it.value}
            {it.volatile && (
              <AssumedBadge source={sigmaSource} assumedShare={assumedShare} />
            )}
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-paper-ink3">{it.hint}</p>
        </div>
      ))}
    </div>
  );
}
