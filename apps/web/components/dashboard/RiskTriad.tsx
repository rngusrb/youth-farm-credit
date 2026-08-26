import { Pill } from "@/components/ui";
import { pct, ratio } from "@/lib/format";
import type { Diagnosis } from "@/lib/api";
import { headlineScenario } from "@/lib/diagnosis";

/** 종합 안전점수를 하나로 합치지 않는다.
 *
 * 100점 만점 하나로 뭉치려면 가중치를 지어내야 하고, 그러면 "이 숫자 어디서
 * 나왔나" 에 답할 수 없다. 대신 엔진이 실제로 계산한 셋을 그대로 세운다.
 */
export default function RiskTriad({ d }: { d: Diagnosis }) {
  const s = headlineScenario(d);
  if (!s) return null;

  const items = [
    {
      label: "상환능력비율 (DSCR)",
      value: ratio(s.dscr_median),
      tone: (s.dscr_median >= d.target_dscr ? "ok" : s.dscr_median >= 1 ? "warn" : "danger") as
        | "ok" | "warn" | "danger",
      state: s.dscr_median >= d.target_dscr ? "여유" : s.dscr_median >= 1 ? "빠듯" : "부족",
      note: `상환기 중앙값 · 은행 권장 ${ratio(d.target_dscr)} 이상`,
    },
    {
      label: "2년 연속 위기 확률",
      value: pct(s.crisis_prob),
      tone: (s.crisis_prob <= d.limits.max_crisis_prob / 2
        ? "ok"
        : s.crisis_prob <= d.limits.max_crisis_prob
          ? "warn"
          : "danger") as "ok" | "warn" | "danger",
      state: s.crisis_prob <= d.limits.max_crisis_prob ? "기준 이내" : "기준 초과",
      note: `감내 기준 ${pct(d.limits.max_crisis_prob)} 이하`,
    },
    {
      label: "최초 위험 연차",
      value: s.first_risk_year ? `${s.first_risk_year}년차` : "없음",
      tone: (s.first_risk_year ? (s.first_risk_year <= 8 ? "danger" : "warn") : "ok") as
        | "ok" | "warn" | "danger",
      state: s.first_risk_year ? "도래" : "해당 없음",
      note: "연간 부족확률이 20%를 처음 넘는 시점",
    },
  ];

  const color = { ok: "text-signal-ok", warn: "text-signal-warn", danger: "text-signal-danger" };

  return (
    <div className="grid gap-px overflow-hidden rounded-lg bg-ink-800 sm:grid-cols-3">
      {items.map((it) => (
        <div key={it.label} className="bg-ink-900 p-4">
          <div className="flex items-start justify-between gap-2">
            <span className="text-[11px] leading-tight text-slate-500">{it.label}</span>
            <Pill tone={it.tone}>{it.state}</Pill>
          </div>
          <div className={`tabular mt-2 text-[26px] font-semibold leading-none ${color[it.tone]}`}>
            {it.value}
          </div>
          <div className="mt-1.5 text-[11px] leading-snug text-slate-600">{it.note}</div>
        </div>
      ))}
    </div>
  );
}
