"use client";

import type { Diagnosis } from "@/lib/api";
import { headlineLimit } from "@/lib/diagnosis";
import { pct, won } from "@/lib/format";

/**
 * 금액별로 무엇이 달라지는지 나란히 (UX-013).
 *
 * "얼마를 빌릴까" 는 농가의 질문인데 금액별 비교는 금융기관 화면에만 있었다.
 *
 * 값은 **전부 엔진 응답 그대로**다. 비교할 금액도 화면이 정하지 않는다 —
 * 엔진이 낸 세 기준(제도 한도 · 은행 심사 · 소득 변동 반영)과, 농가가 직접
 * 넣은 금액(`requested_principal`)뿐이다.
 *
 * 판정하지 않는다 (화법 규칙 2). 각 칸은 조건과 숫자만 놓는다.
 */
type Row = {
  key: string;
  label: string;
  amount: number;
  sub: string;
};

export default function AmountCompare({ d }: { d: Diagnosis }) {
  const rows: Row[] = [
    { key: "at_risk_based", label: "소득 변동까지 반영", amount: d.limits.risk_based,
      sub: `2년 연속 상환이 밀릴 확률 ${pct(d.limits.max_crisis_prob)} 이하` },
    { key: "at_recommended", label: "은행이 보는 선", amount: d.limits.recommended,
      sub: "소득이 흔들리지 않는다는 가정" },
    { key: "at_available", label: "제도상 신청 가능", amount: d.limits.available,
      sub: "시행지침이 정한 세대당 한도" },
  ];
  if (d.input.requested_principal != null && d.scenarios.at_requested) {
    rows.unshift({
      key: "at_requested", label: "내가 넣은 금액",
      amount: d.input.requested_principal, sub: "직접 입력한 금액",
    });
  }

  const head = headlineLimit(d);
  const grace = d.product.grace_years;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] border-t border-gov-ink/70 text-[14px]">
        <caption className="sr-only">
          차입 금액별 상환액과 위험. 값은 모두 엔진 계산 결과입니다.
        </caption>
        <thead>
          <tr className="bg-gov-sunk text-right text-[12px] font-semibold text-gov-ink2">
            <th scope="col" className="border-b border-gov-line px-4 py-3 text-left">기준</th>
            <th scope="col" className="border-b border-gov-line px-4 py-3">금액</th>
            <th scope="col" className="border-b border-gov-line px-4 py-3">거치 중 연이자</th>
            <th scope="col" className="border-b border-gov-line px-4 py-3">{grace + 1}년차 상환액</th>
            <th scope="col" className="border-b border-gov-line px-4 py-3">2년 연속 위기</th>
            <th scope="col" className="border-b border-gov-line px-4 py-3">첫 위험 연차</th>
          </tr>
        </thead>
        <tbody className="tabular text-right">
          {rows.map((r) => {
            const s = d.scenarios[r.key];
            if (!s) return null;
            const mine = Math.round(r.amount) === Math.round(head);
            return (
              <tr key={r.key}
                  className={`border-b border-gov-line2 ${mine ? "bg-gov-soft/50" : ""}`}>
                <th scope="row" className="px-4 py-3 text-left font-medium text-gov-ink">
                  {r.label}
                  {mine && (
                    <span className="ml-1.5 rounded-sm border border-gov-head/30 bg-white px-1 py-px text-[12px] font-semibold text-gov-head">
                      권장
                    </span>
                  )}
                  <span className="mt-0.5 block text-[12px] font-normal text-gov-ink3">{r.sub}</span>
                </th>
                <td className="px-4 py-3 font-semibold text-gov-ink">{won(r.amount)}</td>
                <td className="px-4 py-3 text-gov-ink2">{won(s.grace_payment)}</td>
                <td className="px-4 py-3 text-gov-ink2">{won(s.amort_payment)}</td>
                <td className={`px-4 py-3 font-semibold ${
                  s.crisis_prob > d.limits.max_crisis_prob ? "text-gov-point" : "text-gov-ok2"}`}>
                  {pct(s.crisis_prob)}
                </td>
                <td className="px-4 py-3 text-gov-ink2">
                  {s.first_risk_year ? `${s.first_risk_year}년차` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-[12px] leading-relaxed text-gov-ink3">
        거치 {grace}년 동안은 이자만 내고, {grace + 1}년차부터 원금이 붙어요.
        「첫 위험 연차」는 상환이 밀릴 확률이 처음으로 기준을 넘는 해예요 — 없으면 —로 둬요.
      </p>
    </div>
  );
}
