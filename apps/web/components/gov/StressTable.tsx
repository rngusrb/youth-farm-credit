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
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-t border-gov-ink/70 text-[13px]">
        <caption className="sr-only">시나리오별 상환가능성</caption>
        <thead>
          <tr className="bg-gov-sunk text-right text-[12px] font-semibold text-gov-ink2">
            <th scope="col" className="border-b border-gov-line px-3 py-2.5 text-left">시나리오</th>
            <th scope="col" className="border-b border-gov-line px-3 py-2.5">농업소득</th>
            <th scope="col" className="border-b border-gov-line px-3 py-2.5">상환여력</th>
            <th scope="col" className="border-b border-gov-line px-3 py-2.5">DSCR</th>
            <th scope="col" className="border-b border-gov-line px-3 py-2.5">2년연속 위기</th>
            <th scope="col" className="border-b border-gov-line px-3 py-2.5">상환연기율</th>
            <th scope="col" className="border-b border-gov-line px-3 py-2.5">최초 위험</th>
            <th scope="col" className="border-b border-gov-line px-3 py-2.5 text-center">판정</th>
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
        판정 기준은 2년 연속 위기 확률 {pct(tolerance)} 이하입니다. 한 해 상환이 밀리는 것은
        저축이나 유예로 넘길 수 있지만, 두 해가 연달아 밀리면 돌려막기가 시작되기 때문입니다.
        <b className="text-gov-ink2"> ‘제도 의존’</b> 은 재해 상환연기 덕분에 수치가 좋아 보이는
        경우입니다 — 제도가 구해준 것이지 {audience === "bank" ? "차주가" : "농가가"} 버틴 것이
        아닙니다.
      </p>
    </div>
  );
}
