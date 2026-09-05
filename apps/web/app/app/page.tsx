"use client";

import AsOfLine from "@/components/AsOf";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Btn, DefTable, Empty, Notice, PageTitle, Panel, Section, Stat } from "@/components/gov";
import RiskTriad from "@/components/gov/RiskTriad";
import { fetchCashflow, fetchCrop, runDiagnose, type Cashflow, type CropDetail, type Diagnosis } from "@/lib/api";
import { headlineLimit, headlineScenario, unsafeGap, DRIVER_LABEL } from "@/lib/diagnosis";
import { saveReport } from "@/lib/profile";
import { useFarm } from "@/lib/useFarm";
import { pct, pyeong as fmtPyeong, won } from "@/lib/format";

export default function FarmerHome() {
  const { profile, ready } = useFarm();
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [crop, setCrop] = useState<CropDetail | null>(null);
  const [cf, setCf] = useState<Cashflow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    let alive = true;
    const base = {
      crop_id: profile.cropId, pyeong: profile.pyeong,
      living_cost: profile.livingCost, other_debt_service: profile.otherDebtService,
      product_id: profile.productId,
      // 실적을 base 에 둔다 — 진단에만 넣고 현금흐름에 안 넣으면 한 화면에서
      // 소득이 갈린다 (적대적 리뷰 F4, 2026-09-02).
      income_history: profile.incomeHistory,
    };
    runDiagnose(base)
      .then((d) => {
        if (!alive) return;
        setDiag(d);
        // 「내 리포트」는 리포트를 **열었을 때만** 쌓이고 있었다. 진단만 하고 홈에
        // 머물면 목록이 영영 비어 보인다 — 여기서도 기록한다 (id 로 중복 제거됨).
        const sc = headlineScenario(d);
        saveReport({
          id: d.diagnosis_id,
          cropName: d.input.crop_name,
          pyeong: d.input.pyeong,
          productName: d.product.name,
          riskLimit: headlineLimit(d),
          crisisProb: sc?.crisis_prob ?? 0,
          savedAt: Date.now(),
        });
        return Promise.all([
          fetchCrop(profile.cropId).then((c) => alive && setCrop(c)),
          fetchCashflow({ ...base, principal: headlineLimit(d), year: d.product.grace_years + 1 })
            .then((c) => alive && setCf(c))
            .catch(() => undefined),
        ]);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "계산에 실패했습니다."));
    return () => { alive = false; };
  }, [profile]);

  if (!ready) return null;

  if (!profile) {
    return (
      <>
        <PageTitle title="홈" lead="농장 정보를 넣으면 여기에 요약이 나와요." />
        <Empty
          title="아직 농장 정보가 없어요"
          body="작목과 면적, 생활비 세 가지면 시작해요. 문장으로 적으셔도 알아들어요."
          cta={{ href: "/app/farm", label: "내 농장정보 입력" }}
        />
      </>
    );
  }

  return (
    <>
      <PageTitle
        title="홈"
        lead={diag ? `${diag.input.crop_name} · ${fmtPyeong(diag.input.pyeong)} · ${diag.product.name}` : "계산 중…"}
        aside={<Btn href="/app/farm" variant="ghost">농장 정보 수정</Btn>}
      />

      {error && <div className="mb-5"><Notice tone="danger">{error}</Notice></div>}

      {diag && (
        <>
          <Section title="안전하게 받아야 할 금액" action={
            <Link href={`/result/${diag.diagnosis_id}`} className="inline-flex min-h-11 items-center text-[12px] text-gov-ink3 hover:text-gov-link">
              전체 리포트 +
            </Link>
          }>
            {/* 히어로 — 한 화면에 강조는 한 곳(_GUIDE 모양 규칙).
                숫자가 화면을 지배하고 나머지는 회색조로 내린다. */}
            <div className="overflow-hidden rounded-xl border border-gov-line bg-white shadow-card">
              <div className="border-b border-gov-line2 bg-gradient-to-b from-gov-soft/70 to-white px-6 py-8 sm:px-9 sm:py-10">
                <p className="text-[13px] font-medium text-gov-ink3">
                  2년 연속 대출을 제때 갚지 못할 확률 {pct(diag.limits.max_crisis_prob)} 기준
                </p>
                <p className="tabular mt-2 text-[clamp(1.75rem,8vw,2.75rem)] font-extrabold leading-[1.02] tracking-[-0.035em] text-gov-head sm:text-[3.4rem]">
                  {won(headlineLimit(diag))}
                </p>
                <p className="mt-3.5 max-w-xl text-[14px] leading-[1.75] text-gov-ink2">
                  소득이 줄어드는 때에도 갚을 수 있도록 계산한 금액이에요.
                </p>
                {unsafeGap(diag) > 0 && (
                  <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-gov-ink3">
                    {won(diag.limits.available)}을 다 빌리면 2년 연속 위기 확률이{" "}
                    <b className="text-gov-point">
                      {pct(diag.scenarios.at_available?.crisis_prob ?? 0)}
                    </b>
                    가 돼요. 그 사이가 {won(unsafeGap(diag))}입니다.
                  </p>
                )}
                {/* 이 숫자들이 언제 것인지. 오늘 조회했다고 오늘 데이터가 아니다. */}
                <AsOfLine as_of={diag.as_of} className="mt-4 border-t border-gov-line2 pt-3" />
              </div>
              <div className="px-6 py-6 sm:px-9">
                <RiskTriad d={diag} />
              </div>

              {diag.limits.binding_constraint === "livelihood" && (
                <div className="border-t border-gov-line2 px-6 py-5 sm:px-9">
                  {/* 규칙 9 예외 — 차입 조정으로 풀리지 않는 상태라 단정형을 유지한다. */}
                  <Notice tone="danger" title="대출이 없어도 생활비가 부족해요">
                    새 대출이 없어도 계산상 생활비가 부족해요.
                    농장 규모와 생활비를 먼저 살펴봐야 해요.
                  </Notice>
                </div>
              )}
            </div>
          </Section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="올해 쓸 돈 살펴보기" action={
              <Link href="/app/revenue" className="inline-flex min-h-11 items-center text-[12px] text-gov-ink3 hover:text-gov-link">농사 수입과 지출 +</Link>
            }>
              <Panel>
                {cf ? (
                  <>
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      <Stat label="한 해 쓰고 남는 돈" value={won(cf.annual_net)}
                            tone={cf.annual_net >= 0 ? "ok" : "danger"}
                            note={`${cf.year}년차 기준 (상환 ${won(cf.annual.debt_payment)})`} />
                      <Stat label="가장 빠듯한 달" value={`${cf.trough_month}월`}
                            tone={cf.working_capital_need > 0 ? "danger" : "plain"}
                            note={cf.working_capital_need > 0
                              ? `운전자금 ${won(cf.working_capital_need)} 부족`
                              : `그때도 ${won(cf.trough_balance)} 남아요`} />
                    </div>
                    {!cf.harvest_known && (
                      <p className="mt-3 text-[12px] text-gov-warn">
                        이 작목은 출하월 정보가 없어 12개월 균등으로 펼쳤어요.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-[13px] text-gov-ink3">돈의 흐름을 계산할 수 없어요.</p>
                )}
              </Panel>
            </Section>

            <Section title="이 작목의 소득이 흔들리는 이유" action={
              <Link href="/app/safety" className="inline-flex min-h-11 items-center text-[12px] text-gov-ink3 hover:text-gov-link">안전진단 +</Link>
            }>
              <Panel>
                {crop?.factors ? (
                  <DefTable
                    rows={[
                      ["무엇이 흔드나",
                        <b key="a">{DRIVER_LABEL[crop.factors.driver]}</b>],
                      // 규칙 4 — 쉬운 말이 앞, 용어는 괄호로 뒤. 용어를 지우지는 않는다:
                      // 농가가 은행 창구에서 같은 단어를 써야 한다.
                      ["보통 해에 얼마쯤",
                        <span key="b">
                          <b className="tabular">{won(diag.income.band_p10_p90[0])}</b>
                          {" ~ "}
                          <b className="tabular">{won(diag.income.band_p10_p90[1])}</b>
                          <Badge tone={diag.sigma_personalized ? "info" : "plain"}>
                            {diag.sigma_personalized ? "내 이력 반영" : "작목 평균"}
                          </Badge>
                          <span className="mt-0.5 block text-[12px] text-gov-ink3">
                            10년 중 8년이 이 사이 (소득이 흔들리는 정도 σ {diag.sigma.toFixed(3)})
                          </span>
                        </span>],
                      ["수입이 줄면 소득은 몇 배로 줄까", crop.leverage
                        ? <span key="c">
                            <b className="tabular">{crop.leverage.toFixed(2)}배</b>
                            <span className="mt-0.5 block text-[12px] text-gov-ink3">
                              영업레버리지 {crop.leverage.toFixed(2)}
                            </span>
                          </span>
                        : "—"],
                    ]}
                  />
                ) : (
                  <p className="text-[13px] text-gov-ink3">요인분해 자료가 없어요.</p>
                )}
                <p className="mt-3 text-[12px] leading-relaxed text-gov-ink2">
                  농사 비용는 매출이 줄어도 그대로 나가요. 그래서 들어온 돈이 조금 빠져도
                  소득은 그보다 크게 빠져요.
                </p>
              </Panel>
            </Section>
          </div>

          <Section title="다음으로 해보실 것">
            <div className="grid gap-px bg-gov-line sm:grid-cols-3">
              {[
                ["농사 수입과 지출 보기", "/app/revenue", "월별로 어느 달에 돈이 부족해지는지 확인"],
                ["안전진단 받기", "/app/safety", "가격이 떨어져도 버티는지 시나리오별로 확인"],
                ["어려울 때 받을 도움 확인", "/app/relief", "위기 전에 쓸 수 있는 제도 미리 파악"],
              ].map(([t, href, d]) => (
                <Link key={href} href={href} className="group bg-white p-5 transition-colors hover:bg-gov-sunk">
                  <h3 className="text-[14px] font-bold text-gov-ink group-hover:text-gov-head">{t} →</h3>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-gov-ink2">{d}</p>
                </Link>
              ))}
            </div>
          </Section>

          <Section title="Seed Money는 어떤 서비스인가요">
            <Panel>
              <p className="text-[17px] font-bold leading-relaxed text-gov-ink">
                심은 대로 거두는 농사, <span className="text-gov-head">데이터대로 빌려주는 Seed Money.</span>
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-gov-ink2">
                농가의 경영 데이터를 금융의 언어로 바꾸는 AI 금융 파트너예요.
                농장에 들어오고 나가는 돈을 살펴보고, 꼭 필요한 만큼만 안전하게 빌릴 수 있도록 도와드려요.
              </p>
            </Panel>
          </Section>
        </>
      )}
    </>
  );
}
