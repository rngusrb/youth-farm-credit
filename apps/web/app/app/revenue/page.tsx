"use client";

import { useEffect, useState } from "react";
import { Badge, Btn, Empty, Notice, PageTitle, Panel, Section, Stat } from "@/components/gov";
import CashflowChart from "@/components/gov/CashflowChart";
import { fetchCashflow, runDiagnose, type Cashflow, type Diagnosis } from "@/lib/api";
import { headlineLimit } from "@/lib/diagnosis";
import { useFarm } from "@/lib/useFarm";
import { won } from "@/lib/format";

export default function RevenuePage() {
  const { profile, ready } = useFarm();
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [cf, setCf] = useState<Cashflow | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [principal, setPrincipal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    runDiagnose({
      crop_id: profile.cropId, pyeong: profile.pyeong, living_cost: profile.livingCost,
      other_debt_service: profile.otherDebtService, product_id: profile.productId,
      income_history: profile.incomeHistory,
    })
      .then((d) => {
        setDiag(d);
        setPrincipal((p) => p ?? headlineLimit(d));
        setYear((y) => y ?? d.product.grace_years + 1);
      })
      .catch(() => setError("계산에 실패했습니다."));
  }, [profile]);

  useEffect(() => {
    if (!profile || year == null || principal == null) return;
    fetchCashflow({
      crop_id: profile.cropId, pyeong: profile.pyeong, living_cost: profile.livingCost,
      other_debt_service: profile.otherDebtService, product_id: profile.productId,
      principal, year,
    })
      .then(setCf)
      .catch((e) => setError(e instanceof Error ? e.message : "현금흐름 계산 실패"));
  }, [profile, year, principal]);

  if (!ready) return null;
  if (!profile) {
    return (
      <>
        <PageTitle title="수익 전망" lead="농가 정보가 있어야 계산합니다." />
        <Empty title="농가 정보가 없습니다" body="작목과 면적을 먼저 입력해 주세요."
               cta={{ href: "/app/farm", label: "내 농가 정보 입력" }} />
      </>
    );
  }

  const grace = diag?.product.grace_years ?? 5;
  const years = diag ? [1, grace, grace + 1, grace + 5, diag.product.grace_years + diag.product.amort_years] : [];

  return (
    <>
      <PageTitle
        title="수익 전망"
        lead="연 단위로는 보이지 않는 것이 있습니다. 소득은 수확기에 몰려 들어오는데 경영비와 생활비는 매달 나갑니다. 연간으로 흑자여도 특정 달에는 현금이 마를 수 있습니다."
      />

      {error && <div className="mb-5"><Notice tone="danger">{error}</Notice></div>}

      {diag && cf && (
        <>
          <Section title="연간 수지">
            <Panel>
              <div className="grid gap-5 sm:grid-cols-4">
                <Stat label="총수입" value={won(cf.annual.gross)}
                      note={`${cf.crop.cashflow_year}년 소득조사 기준`} />
                <Stat label="경영비" value={won(cf.annual.operating_cost)} />
                <Stat label="농업소득" value={won(cf.annual.income)} tone="ok" />
                <Stat label="연 순현금" value={won(cf.annual_net)}
                      tone={cf.annual_net >= 0 ? "ok" : "danger"}
                      note="생활비·상환까지 뺀 뒤" />
              </div>
            </Panel>
          </Section>

          <Section title="월별 현금흐름">
            <Panel>
              <div className="mb-5 flex flex-wrap items-center gap-4 border-b border-gov-line2 pb-4">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold text-gov-ink2">연차</span>
                  {years.map((y) => (
                    <button key={y} onClick={() => setYear(y)} aria-pressed={year === y}
                            className={`inline-flex min-h-11 items-center border px-3 text-[12px] ${
                              year === y ? "border-gov-head bg-gov-soft font-semibold text-gov-head"
                                         : "border-gov-line text-gov-ink2 hover:border-gov-link"}`}>
                      {y}년차{y === grace + 1 ? " (절벽)" : y <= grace ? " (거치)" : ""}
                    </button>
                  ))}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <label htmlFor="principal" className="text-[13px] font-semibold text-gov-ink2">차입 원금</label>
                  <input id="principal" inputMode="numeric"
                         value={principal != null ? Math.round(principal / 10_000) : ""}
                         onChange={(e) => setPrincipal(Number(e.target.value.replace(/[^\d]/g, "")) * 10_000)}
                         className="w-28 min-h-11 border border-gov-line px-2.5 text-right text-[13px] tabular outline-none focus:border-gov-link" />
                  <span className="text-[12px] text-gov-ink3">만원</span>
                </div>
              </div>

              <CashflowChart months={cf.months} troughMonth={cf.trough_month} />

              <div className="mt-5 grid gap-5 border-t border-gov-line2 pt-4 sm:grid-cols-3">
                <Stat label="가장 빠듯한 달" value={`${cf.trough_month}월`}
                      tone={cf.working_capital_need > 0 ? "danger" : "plain"} />
                <Stat label={cf.working_capital_need > 0 ? "필요한 운전자금" : "그때 남는 돈"}
                      value={won(cf.working_capital_need > 0 ? cf.working_capital_need : cf.trough_balance)}
                      tone={cf.working_capital_need > 0 ? "danger" : "ok"} />
                <Stat label="그 해 상환액" value={won(cf.annual.debt_payment)}
                      note={cf.is_grace_year ? "거치기간 — 이자만" : "원금 + 이자"} />
              </div>

              {cf.working_capital_need > 0 && (
                <div className="mt-4">
                  <Notice tone="danger" title={`${cf.trough_month}월에 현금이 마릅니다`}>
                    연간으로는 {cf.annual_net >= 0 ? "흑자" : "적자"}지만, 수확 대금이 들어오기
                    전까지 {won(cf.working_capital_need)}가 부족합니다. 운전자금 대출이나 출하
                    시기 분산을 미리 검토해 두시는 것이 좋습니다.
                  </Notice>
                </div>
              )}
            </Panel>
          </Section>

          <Section title="월별 명세">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-t border-gov-ink/70 text-[13px]">
                <thead>
                  <tr className="bg-gov-sunk text-right text-[12px] font-semibold text-gov-ink2">
                    <th scope="col" className="border-b border-gov-line px-3 py-2.5 text-left">월</th>
                    <th scope="col" className="border-b border-gov-line px-3 py-2.5">수입</th>
                    <th scope="col" className="border-b border-gov-line px-3 py-2.5">경영비</th>
                    <th scope="col" className="border-b border-gov-line px-3 py-2.5">생활비</th>
                    <th scope="col" className="border-b border-gov-line px-3 py-2.5">상환</th>
                    <th scope="col" className="border-b border-gov-line px-3 py-2.5">순현금</th>
                    <th scope="col" className="border-b border-gov-line px-3 py-2.5">누적</th>
                  </tr>
                </thead>
                <tbody className="tabular text-right">
                  {cf.months.map((m) => (
                    <tr key={m.month}
                        className={`border-b border-gov-line2 ${m.month === cf.trough_month ? "bg-gov-point/5" : ""}`}>
                      <th scope="row" className="px-3 py-2 text-left font-medium text-gov-ink">
                        {m.month}월
                        {cf.harvest_months.includes(m.month) && (
                          <span className="ml-1.5 text-[12px] font-normal text-gov-link">출하</span>
                        )}
                      </th>
                      <td className="px-3 py-2 text-gov-ink2">{m.revenue ? won(m.revenue) : "—"}</td>
                      <td className="px-3 py-2 text-gov-ink2">{won(m.operating)}</td>
                      <td className="px-3 py-2 text-gov-ink2">{won(m.living)}</td>
                      <td className="px-3 py-2 text-gov-ink2">{m.debt ? won(m.debt) : "—"}</td>
                      <td className={`px-3 py-2 font-medium ${m.net >= 0 ? "text-gov-ok" : "text-gov-point"}`}>
                        {won(m.net)}
                      </td>
                      <td className={`px-3 py-2 font-semibold ${m.balance >= 0 ? "text-gov-ink" : "text-gov-point"}`}>
                        {won(m.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-gov-ink3">{cf.note}</p>
            {!cf.harvest_known && (
              <p className="mt-1.5 text-[12px] text-gov-warn">
                이 작목은 출하월 정보를 아직 확보하지 못해 12개월 균등으로 펼쳤습니다.
                실제 출하가 몰려 있다면 부족 시점은 더 뚜렷해집니다.
              </p>
            )}
          </Section>

          <div className="flex gap-2">
            <Btn href="/app/safety">이 조건으로 안전진단 받기</Btn>
            <Btn href="/app/finance" variant="ghost">적정 차입 규모 보기</Btn>
          </div>
        </>
      )}
    </>
  );
}
