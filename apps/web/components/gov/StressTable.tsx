import { Badge } from "@/components/gov";
import type { StressScenario } from "@/lib/api";
import { pct, ratio, won } from "@/lib/format";

/** 시나리오별 상환가능성.
 *
 * 판정은 crisis_prob 으로 한다. 다만 재해 시나리오는 상환연기가 늘어 이 값이
 * **낮아지는** 착시가 있어서, 그런 경우 '제도 의존' 을 따로 표시한다.
 */
export default function StressTable({
  scenarios, tolerance, audience = "farmer",
}: {
  scenarios: StressScenario[];
  tolerance: number;
  audience?: "farmer" | "bank";
}) {
  return (
    <div className="table-scroll overflow-x-auto" tabIndex={0} role="region" aria-label="표 또는 차트 상세 · 좌우로 스크롤">
      <table className="w-full min-w-[820px] border-t border-gov-ink/70 text-[13px]">
        <caption className="sr-only">상황별로 대출을 갚을 수 있는지</caption>
        <thead>
          <tr className="bg-gov-sunk text-right text-[12px] font-semibold text-gov-ink2">
            <th scope="col" className="border-b border-gov-line px-3 py-2.5 text-left">시나리오</th>
            <th scope="col" className="border-b border-gov-line px-3 py-2.5">농사로 번 돈</th>
            <th scope="col" className="border-b border-gov-line px-3 py-2.5">갚는 데 쓸 돈</th>
            <th scope="col" className="border-b border-gov-line px-3 py-2.5">갚을 돈의 여유 (DSCR)</th>
            <th scope="col" className="border-b border-gov-line px-3 py-2.5">2년 연속 돈 부족</th>
            <th scope="col" className="border-b border-gov-line px-3 py-2.5">갚는 날을 미룰 확률</th>
            <th scope="col" className="border-b border-gov-line px-3 py-2.5">처음 부족할 해</th>
            <th scope="col" className="border-b border-gov-line px-3 py-2.5 text-center">계산 결과</th>
          </tr>
        </thead>
        <tbody className="tabular text-right">
          {scenarios.map((s) => (
            <tr key={s.key}
                className={`border-b border-gov-line2 ${s.key === "base" ? "bg-gov-sunk/60" : ""}`}>
              <th scope="row" className="px-3 py-2.5 text-left">
                <span className="font-semibold text-gov-ink">{s.label}</span>
                <span className="block text-[12px] font-normal text-gov-ink3">{s.detail}</span>
              </th>
              <td className="px-3 py-2.5 text-gov-ink2">
                {won(s.income)}
                {s.income_change !== 0 && (
                  <span className="block text-[12px] text-gov-point">{pct(s.income_change)}</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-gov-ink2">{won(s.capacity)}</td>
              <td className={`px-3 py-2.5 font-medium ${s.dscr_median < 1 ? "text-gov-point" : "text-gov-ink"}`}>
                {ratio(s.dscr_median)}
              </td>
              <td className={`px-3 py-2.5 font-semibold ${s.crisis_prob > tolerance ? "text-gov-point" : "text-gov-ink"}`}>
                {pct(s.crisis_prob)}
              </td>
              <td className="px-3 py-2.5 text-gov-ink2">{pct(s.deferral_prob)}</td>
              <td className="px-3 py-2.5 text-gov-ink2">
                {s.first_risk_year ? `${s.first_risk_year}년차` : "없음"}
              </td>
              <td className="px-3 py-2.5 text-center">
                <Badge tone={s.survives ? "ok" : "danger"}>{s.survives ? "버팀" : "위험"}</Badge>
                {s.relies_on_relief && (
                  <span className="mt-1 block text-[12px] text-gov-warn">제도 의존</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[12px] leading-relaxed text-gov-ink3">
        대출을 갚을 돈이 2년 연속 모자랄 확률을 {pct(tolerance)} 이하로 보는 기준이에요.
        ‘제도 의존’은 재해 지원으로 갚는 날을 미룬 덕분에 위험이 낮아진 경우예요.
        {audience === "bank" ? "신청자" : "농가"}의 소득이 늘어난 것은 아니에요.
        DSCR은 갚는 데 쓸 돈을 갚아야 할 돈으로 나눈 값이에요. 1보다 작으면 모자라요.
      </p>
    </div>
  );
}
