"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Btn, Empty, Notice, PageTitle, Panel, Section, Stat } from "@/components/gov";
import CashflowChart from "@/components/gov/CashflowChart";
import FundingMap from "@/components/FundingMap";
import { fetchCashflow, runDiagnose, type Cashflow, type Diagnosis,
  fetchFundingMap,
  type FundingMapResult,
} from "@/lib/api";
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
  const [map, setMap] = useState<FundingMapResult | null>(null);

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
      .catch(() => setError("계산에 실패했어요."));
  }, [profile]);

  useEffect(() => {
    if (!profile || year == null || principal == null) return;
    fetchCashflow({
      crop_id: profile.cropId, pyeong: profile.pyeong, living_cost: profile.livingCost,
      other_debt_service: profile.otherDebtService, product_id: profile.productId,
      principal, year,
    })
      .then(setCf)
      .catch((e) => setError(e instanceof Error ? e.message : "돈의 흐름 계산 실패"));
  }, [profile, year, principal]);

  // 25년 자금지도 — 연 단위 표로는 안 보이는 '언제부터 부담이 커지나' 를 한 장으로.
  useEffect(() => {
    if (!profile || principal == null || principal <= 0) return;
    fetchFundingMap({
      crop_id: profile.cropId, pyeong: profile.pyeong, living_cost: profile.livingCost,
      other_debt_service: profile.otherDebtService, principal,
    })
      .then(setMap)
      .catch(() => undefined);   // 지도는 보조 정보다. 실패해도 본문은 보여준다
  }, [profile, principal]);

  if (!ready) return null;
  if (!profile) {
    return (
      <>
        <PageTitle title="농사 수입과 지출" lead="농가 정보가 있어야 계산해요." />
        <Empty title="농가 정보가 없어요" body="작목과 면적을 먼저 입력해 주세요."
               cta={{ href: "/app/farm", label: "내 농장정보 입력" }} />
      </>
    );
  }

  const grace = diag?.product.grace_years ?? 5;
  const years = diag ? [1, grace, grace + 1, grace + 5, diag.product.grace_years + diag.product.amort_years] : [];

  return (
    <>
      <PageTitle
        title="농사 수입과 지출"
        lead="수확한 돈이 들어오기 전에도 농사 비용과 생활비는 나가요. 월별로 들어올 돈과 나갈 돈을 확인해 보세요."
      />

      {error && <div className="mb-5"><Notice tone="danger">{error}</Notice></div>}

      {diag && cf && (
        <>
          <Section title="한 해 돈 정리">
            <Panel>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                <Stat label="들어올 돈" value={won(cf.annual.gross)}
                      note={`${cf.crop.cashflow_year}년 소득조사 기준`} />
                <Stat label="농사 비용" value={won(cf.annual.operating_cost)} />
                <Stat label="농사로 번 돈" value={won(cf.annual.income)} tone="ok" />
                <Stat label="한 해 쓰고 남는 돈" value={won(cf.annual_net)}
                      tone={cf.annual_net >= 0 ? "ok" : "danger"}
                      note="생활비·상환까지 뺀 뒤" />
              </div>
            </Panel>
          </Section>

          {map && (
            <Section title="25년 자금지도">
              <Panel>
                <p className="mb-3 text-[13px] text-gov-ink2">
                  {won(map.principal)} 을 빌렸을 때 해마다 얼마를 갚는지 한 장으로 본 것이에요.
                  분기점 설명과 연도 선택은{" "}
                  <Link href="/app/map" className="text-gov-link underline">AI 농사 자금지도</Link>
                  에 있어요.
                </p>
                <FundingMap data={map} />
              </Panel>
            </Section>
          )}

          <Section title="월별 들어오고 나가는 돈">
            <Panel>
              <div className="mb-5 flex flex-wrap items-center gap-4 border-b border-gov-line2 pb-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[13px] font-semibold text-gov-ink2">연차</span>
                  {years.map((y) => (
                    <button key={y} onClick={() => setYear(y)} aria-pressed={year === y}
                            className={`inline-flex min-h-11 items-center rounded-md border px-3 text-[12px] ${
                              year === y ? "border-gov-head bg-gov-soft font-semibold text-gov-head"
                                         : "border-gov-line text-gov-ink2 hover:border-gov-link"}`}>
                      {y}년차{y === grace + 1 ? " (원금도 갚기 시작)" : y <= grace ? " (이자만)" : ""}
                    </button>
                  ))}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <label htmlFor="principal" className="text-[13px] font-semibold text-gov-ink2">빌릴 금액</label>
                  <input id="principal" inputMode="numeric"
                         value={principal != null ? Math.round(principal / 10_000) : ""}
                         onChange={(e) => setPrincipal(Number(e.target.value.replace(/[^\d]/g, "")) * 10_000)}
                         className="w-28 min-h-11 rounded-md border border-gov-line px-2.5 text-right text-[13px] tabular outline-none focus:border-gov-link" />
                  <span className="text-[12px] text-gov-ink3">만원</span>
                </div>
              </div>

              <CashflowChart months={cf.months} troughMonth={cf.trough_month} />

              <div className="mt-5 grid gap-5 border-t border-gov-line2 pt-4 sm:grid-cols-3">
                <Stat label="가장 빠듯한 달" value={`${cf.trough_month}월`}
                      tone={cf.working_capital_need > 0 ? "danger" : "plain"} />
                <Stat label={cf.working_capital_need > 0 ? "미리 준비할 돈" : "그때 남는 돈"}
                      value={won(cf.working_capital_need > 0 ? cf.working_capital_need : cf.trough_balance)}
                      tone={cf.working_capital_need > 0 ? "danger" : "ok"} />
                <Stat label="그해 갚을 대출금과 이자" value={won(cf.annual.debt_payment)}
                      note={cf.is_grace_year ? "이자만 내는 기간" : "원금 + 이자"} />
              </div>

              {cf.working_capital_need > 0 && (
                <div className="mt-4">
                  <Notice tone="danger" title={`${cf.trough_month}월에 돈이 부족할 수 있어요`}>
                    수확한 돈이 들어오기 전까지 {won(cf.working_capital_need)}이 부족할 수 있어요.
                    한 해 전체로는 돈이 {cf.annual_net >= 0 ? "남는" : "모자라는"} 계산이에요.
                    미리 쓸 돈을 마련하거나 판매 시기를 나눌 수 있는지 살펴보세요.
                  </Notice>
                </div>
              )}
            </Panel>
          </Section>

          <Section title="월별 돈 내역">
            <div className="table-scroll overflow-x-auto" tabIndex={0} role="region" aria-label="표 또는 차트 상세 · 좌우로 스크롤">
              <table className="w-full min-w-[680px] border-t border-gov-ink/70 text-[13px]">
                <thead>
                  <tr className="bg-gov-sunk text-right text-[12px] font-semibold text-gov-ink2">
                    <th scope="col" className="border-b border-gov-line px-3 py-2.5 text-left">월</th>
                    <th scope="col" className="border-b border-gov-line px-3 py-2.5">들어올 돈</th>
                    <th scope="col" className="border-b border-gov-line px-3 py-2.5">농사 비용</th>
                    <th scope="col" className="border-b border-gov-line px-3 py-2.5">생활비</th>
                    <th scope="col" className="border-b border-gov-line px-3 py-2.5">갚을 대출금·이자</th>
                    <th scope="col" className="border-b border-gov-line px-3 py-2.5">그달 쓰고 남는 돈</th>
                    <th scope="col" className="border-b border-gov-line px-3 py-2.5">그달까지 남는 돈</th>
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
                이 작목은 출하월 정보를 아직 확보하지 못해 12개월 균등으로 펼쳤어요.
                실제 출하가 몰려 있다면 부족 시점은 더 뚜렷해져요.
              </p>
            )}
          </Section>

          <div className="flex gap-2">
            <Btn href="/app/safety">이 조건으로 안전진단 받기</Btn>
            <Btn href="/app/finance" variant="ghost">대출 계획 보기</Btn>
          </div>
        </>
      )}
    </>
  );
}
