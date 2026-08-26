import { pct, won } from "@/lib/format";

type Props = {
  available: number;
  recommended: number;
  riskBased: number;
  targetDscr: number;
  maxCrisisProb: number;
  crisisAtAvailable: number;
  crisisAtRecommended: number;
  crisisAtRiskBased: number | null;
  binding: "loan" | "livelihood";
  livelihoodFloorProb: number;
};

type Rung = {
  key: string;
  label: string;
  basis: string;
  amount: number;
  crisis: number | null;
  tone: "danger" | "warn" | "ok";
};

const TONE = {
  danger: { bar: "bg-paper-danger", text: "text-paper-danger" },
  warn: { bar: "bg-paper-accent", text: "text-paper-accent" },
  ok: { bar: "bg-paper-ok", text: "text-paper-ok" },
} as const;

/**
 * 세 개의 한도를 한 축에 세운다.
 * 제도가 허락하는 금액 → 은행 심사 기준 금액 → 실제 상환 확률 기준 금액.
 * 셋이 벌어지는 폭 자체가 이 서비스의 결론이다.
 */
export default function LimitLadder({
  available,
  recommended,
  riskBased,
  targetDscr,
  maxCrisisProb,
  crisisAtAvailable,
  crisisAtRecommended,
  crisisAtRiskBased,
  binding,
  livelihoodFloorProb,
}: Props) {
  const livelihoodBound = binding === "livelihood";
  const rungs: Rung[] = [
    {
      key: "available",
      label: "제도상 신청 가능",
      basis: "시행지침 한도",
      amount: available,
      crisis: crisisAtAvailable,
      tone: "danger",
    },
    {
      key: "recommended",
      label: "DSCR 기준 권장",
      basis: `상환여력이 원리금의 ${targetDscr.toFixed(2)}배 (은행 심사 관행)`,
      amount: recommended,
      crisis: crisisAtRecommended,
      tone: "warn",
    },
    {
      key: "risk",
      label: "상환위험 기준",
      basis: livelihoodBound
        ? "차입 규모로는 목표 위험을 맞출 수 없음"
        : `2년 연속 상환부족 확률 ${pct(maxCrisisProb)} 이하`,
      amount: riskBased,
      crisis: livelihoodBound ? null : crisisAtRiskBased,
      tone: livelihoodBound ? "danger" : "ok",
    },
  ];

  return (
    <section className="rounded-2xl border border-paper-rule bg-paper-panel p-6 sm:p-8">
      <div className="space-y-5">
        {rungs.map((r) => {
          const share = available > 0 ? Math.max(r.amount / available, 0.02) : 0;
          return (
            <div key={r.key}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs text-paper-ink2">{r.label}</span>
                <span className={`tabular text-xl font-bold ${TONE[r.tone].text}`}>
                  {won(r.amount)}
                </span>
              </div>
              <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-paper-soft">
                <div
                  className={`h-full rounded-full ${TONE[r.tone].bar}`}
                  style={{ width: `${share * 100}%` }}
                />
              </div>
              <div className="mt-1 flex flex-wrap justify-between gap-x-4 text-[12px] text-paper-ink3">
                <span>{r.basis}</span>
                {r.crisis !== null && (
                  <span>2년연속 위기확률 {pct(r.crisis)}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {livelihoodBound && (
        <p className="mt-6 border-t border-paper-rule pt-4 text-sm leading-relaxed text-paper-ink2">
          여기서 <span className="text-paper-danger">0원</span>은 계산 오류가 아닙니다.
          대출을 한 푼도 받지 않아도 소득이 생활비 아래로 떨어져 2년 연속 적자가 날
          확률이{" "}
          <span className="tabular font-semibold text-paper-danger">
            {pct(livelihoodFloorProb)}
          </span>
          입니다. 지금 문제는 <strong className="text-paper-ink">얼마를 빌리느냐</strong>가
          아니라 <strong className="text-paper-ink">이 규모로 생계가 되느냐</strong>입니다.
          차입을 줄이는 것으로는 해결되지 않고, 재배 규모나 생활비 기준을 먼저
          손봐야 합니다.
        </p>
      )}

      {!livelihoodBound && recommended > riskBased && (
        <p className="mt-6 border-t border-paper-rule pt-4 text-sm leading-relaxed text-paper-ink2">
          은행 기준을 통과하는 금액({won(recommended)})에서도 2년 연속 상환이 밀릴
          확률은{" "}
          <span className="tabular font-semibold text-paper-accent">
            {pct(crisisAtRecommended)}
          </span>
          입니다. DSCR은 소득을 매년 일정하다고 보고 계산하기 때문입니다. 소득이
          흔들리는 것까지 감안하면{" "}
          <span className="tabular font-semibold text-paper-ok">{won(riskBased)}</span>
          {" "}선입니다.
        </p>
      )}
    </section>
  );
}
