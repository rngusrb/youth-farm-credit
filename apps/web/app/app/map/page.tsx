"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import FundingMap from "@/components/FundingMap";
import IncomeSource from "@/components/IncomeSource";
import { Btn, Empty, Notice, PageTitle, Panel, Section, Stat } from "@/components/gov";
import CashflowChart from "@/components/gov/CashflowChart";
import {
  fetchCashflow,
  fetchFundingMap,
  runDiagnose,
  type Cashflow,
  type Diagnosis,
  type FundingMapResult,
} from "@/lib/api";
import { headlineLimit } from "@/lib/diagnosis";
import { won } from "@/lib/format";
import { useFarm } from "@/lib/useFarm";

/** 3단계 — AI 농사 자금지도.
 *
 * 이 서비스의 핵심 주장은 한 문장이다:
 * **"5년 거치 뒤 6년차에 원금 상환이 한 번에 시작된다."**
 * 그 한 문장을 두 개의 시간 축으로 보여준다 —
 *  · **1년**: 어느 달에 현금이 마르는가 (소득은 수확기에 몰리고 지출은 매달 나간다)
 *  · **25년**: 어느 해에 부담이 절벽처럼 뛰는가
 *
 * 2026-09-02 이전에는 이게 "수익 전망" 화면의 세 번째 섹션에 묻혀 있었다.
 * 핵심 기능이 목차에 없으면 아무도 못 찾는다.
 *
 * **화면은 계산하지 않는다** — 막대 높이만 값에서 뽑고 숫자는 엔진 것을 쓴다.
 */
export default function MapPage() {
  const { profile, ready } = useFarm();
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [map, setMap] = useState<FundingMapResult | null>(null);
  const [cf, setCf] = useState<Cashflow | null>(null);
  const [principal, setPrincipal] = useState<number | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    runDiagnose({
      crop_id: profile.cropId,
      pyeong: profile.pyeong,
      living_cost: profile.livingCost,
      other_debt_service: profile.otherDebtService,
      product_id: profile.productId,
      income_history: profile.incomeHistory,
    })
      .then((d) => {
        setDiag(d);
        // 계획에 적어 둔 금액이 있으면 그걸 먼저 본다. 없으면 권장 한도.
        setPrincipal((p) => p ?? profile.targetPrincipal ?? headlineLimit(d));
        setYear((y) => y ?? d.product.grace_years + 1);
      })
      .catch(() => setError("계산에 실패했어요."));
  }, [profile]);

  useEffect(() => {
    if (!profile || principal == null || principal <= 0) return;
    fetchFundingMap({
      crop_id: profile.cropId,
      pyeong: profile.pyeong,
      living_cost: profile.livingCost,
      other_debt_service: profile.otherDebtService,
      // 실적을 안 보내면 자금지도만 작목 통계 추정치로 그려진다 (적대적 리뷰 H1)
      ...(profile.incomeHistory?.length ? { actual_income: profile.incomeHistory } : {}),
      // 상품을 안 보내면 기본값(후계농 20년)으로 그려진다. 우수후계농은 10년 상환이라
      // 15년짜리 대출을 25년 지도로 보게 된다 (적대적 리뷰 F5, 2026-09-02).
      product_id: profile.productId,
      principal,
    })
      .then(setMap)
      .catch((e) => setError(e instanceof Error ? e.message : "자금지도를 그리지 못했어요."));
  }, [profile, principal]);

  useEffect(() => {
    if (!profile || year == null || principal == null || principal <= 0) return;
    fetchCashflow({
      crop_id: profile.cropId,
      pyeong: profile.pyeong,
      living_cost: profile.livingCost,
      other_debt_service: profile.otherDebtService,
      product_id: profile.productId,
      // 자금지도와 같은 소득 기준으로 그린다 (적대적 리뷰 F4)
      ...(profile.incomeHistory?.length ? { actual_income: profile.incomeHistory } : {}),
      principal,
      year,
    })
      .then(setCf)
      .catch(() => undefined); // 월별은 보조다. 실패해도 지도는 보여준다
  }, [profile, year, principal]);

  if (!ready) return null;
  if (!profile) {
    return (
      <>
        <PageTitle title="AI 농사 자금지도" lead="농가 정보가 있어야 그릴 수 있어요." />
        <Empty
          title="농가 정보가 없어요"
          body="작목과 면적을 먼저 입력해 주세요."
          cta={{ href: "/app/farm", label: "내 농장정보 입력" }}
        />
      </>
    );
  }

  const grace = diag?.product.grace_years ?? 5;
  const yearTabs = diag
    ? [1, grace, grace + 1, grace + 5, diag.product.grace_years + diag.product.amort_years]
    : [];

  return (
    <>
      <PageTitle
        title="AI 농사 자금지도"
        lead="어느 달에 돈이 부족할지 살펴보세요. 대출을 갚는 동안 해마다 부담이 어떻게 달라지는지도 볼 수 있어요."
      />

      {error && <div className="mb-5"><Notice tone="danger">{error}</Notice></div>}

      {diag && (
        <div className="mb-5">
          <IncomeSource d={diag} />
        </div>
      )}

      <Section title="빌릴 금액">
        <Panel>
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="principal" className="text-[13px] font-semibold text-gov-ink2">
              빌릴 금액
            </label>
            <input
              id="principal"
              inputMode="numeric"
              value={principal != null ? Math.round(principal / 10_000) : ""}
              onChange={(e) =>
                setPrincipal(Number(e.target.value.replace(/[^\d]/g, "")) * 10_000)
              }
              className="min-h-11 w-32 rounded-md border border-gov-line px-2.5 text-right text-[13px] tabular outline-none focus:border-gov-link"
            />
            <span className="text-[12px] text-gov-ink3">만원</span>
            {diag && (
              <button
                type="button"
                onClick={() => setPrincipal(headlineLimit(diag))}
                className="inline-flex min-h-11 items-center text-[12px] text-gov-link underline"
              >
                권장 금액으로 되돌리기
              </button>
            )}
          </div>
        </Panel>
      </Section>

      {cf && (
        <Section title="한 해 동안 들어오고 나가는 돈">
          <Panel>
            <div className="mb-5 flex flex-wrap items-center gap-1.5 border-b border-gov-line2 pb-4">
              <span className="mr-1 text-[13px] font-semibold text-gov-ink2">연차</span>
              {yearTabs.map((y) => (
                <button
                  key={y}
                  onClick={() => setYear(y)}
                  aria-pressed={year === y}
                  className={`inline-flex min-h-11 items-center rounded-md border px-3 text-[12px] ${
                    year === y
                      ? "border-gov-head bg-gov-soft font-semibold text-gov-head"
                      : "border-gov-line text-gov-ink2 hover:border-gov-link"
                  }`}
                >
                  {y}년차{y === grace + 1 ? " (원금도 갚기 시작)" : y <= grace ? " (이자만)" : ""}
                </button>
              ))}
            </div>

            <CashflowChart months={cf.months} troughMonth={cf.trough_month} />

            <div className="mt-5 grid gap-5 border-t border-gov-line2 pt-4 sm:grid-cols-3">
              <Stat
                label="가장 빠듯한 달"
                value={`${cf.trough_month}월`}
                tone={cf.working_capital_need > 0 ? "danger" : "plain"}
              />
              <Stat
                label={cf.working_capital_need > 0 ? "미리 준비할 돈" : "그때 남는 돈"}
                value={won(
                  cf.working_capital_need > 0 ? cf.working_capital_need : cf.trough_balance,
                )}
                tone={cf.working_capital_need > 0 ? "danger" : "ok"}
              />
              <Stat
                label="그해 갚을 대출금과 이자"
                value={won(cf.annual.debt_payment)}
                note={cf.is_grace_year ? "이자만 내는 기간" : "원금 + 이자"}
              />
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

            <p className="mt-3 text-[12px] text-gov-ink3">
              월별 수입·지출 표는{" "}
              <Link href="/app/revenue" className="text-gov-link underline">
                농사 수입과 지출
              </Link>
              에서 볼 수 있어요.
            </p>
          </Panel>
        </Section>
      )}

      {map && (
        <Section title={`${map.term_years}년 자금지도`}>
          <Panel>
            <p className="mb-3 text-[13px] text-gov-ink2">
              {won(map.principal)}을 빌리면 해마다 갚을 돈이 얼마나 될까요?
              대출을 갚는 데 쓸 돈과 나란히 비교해요.
            </p>
            <FundingMap data={map} />
            <ol className="mt-4 space-y-2 border-t border-gov-line2 pt-3">
              {map.milestones
                .filter((m) => m.label)
                .map((m) => (
                  <li key={m.kind} className="flex gap-2 text-[13px]">
                    <span
                      aria-hidden
                      className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-gov-head"
                    />
                    <span className="text-gov-head">{m.label}</span>
                  </li>
                ))}
            </ol>
            <p className="mt-3 text-[12px] leading-relaxed text-gov-ink3">{map.note}</p>
          </Panel>
        </Section>
      )}

      <Section title="다음으로">
        <div className="flex flex-wrap gap-2">
          <Btn href="/app/assistant">이 결과를 두고 물어보기</Btn>
          <Btn href="/app/prescribe" variant="ghost">맞춤 처방 받기</Btn>
        </div>
      </Section>
    </>
  );
}
