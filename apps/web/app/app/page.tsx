"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Btn, DefTable, Empty, Notice, PageTitle, Panel, Section, Stat } from "@/components/gov";
import RiskTriad from "@/components/gov/RiskTriad";
import { fetchCashflow, fetchCrop, runDiagnose, type Cashflow, type CropDetail, type Diagnosis } from "@/lib/api";
import { headlineLimit, unsafeGap } from "@/lib/diagnosis";
import { useFarm } from "@/lib/useFarm";
import { pyeong as fmtPyeong, won } from "@/lib/format";

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
    };
    runDiagnose({ ...base, income_history: profile.incomeHistory })
      .then((d) => {
        if (!alive) return;
        setDiag(d);
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
        <PageTitle title="홈" lead="농가 정보를 넣으면 여기에 요약이 표시됩니다." />
        <Empty
          title="아직 농가 정보가 없습니다"
          body="작목과 면적, 생활비 세 가지면 시작합니다. 문장으로 적어도 알아듣습니다."
          cta={{ href: "/app/farm", label: "내 농가 정보 입력" }}
        />
      </>
    );
  }

  return (
    <>
      <PageTitle
        title="홈"
        lead={diag ? `${diag.input.crop_name} · ${fmtPyeong(diag.input.pyeong)} · ${diag.product.name}` : "계산 중…"}
        aside={<Btn href="/app/farm" variant="ghost">농가 정보 수정</Btn>}
      />

      {error && <div className="mb-5"><Notice tone="danger">{error}</Notice></div>}

      {diag && (
        <>
          <Section title="감당할 수 있는 차입 규모" action={
            <Link href={`/result/${diag.diagnosis_id}`} className="text-[12px] text-gov-ink3 hover:text-gov-link">
              전체 리포트 +
            </Link>
          }>
            <Panel>
              <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
                <div className="lg:w-56">
                  <Stat
                    label="AI 권장 차입"
                    value={won(headlineLimit(diag))}
                    tone={unsafeGap(diag) > 0 ? "warn" : "ok"}
                  />
                  <p className="mt-3 text-[12px] leading-relaxed text-gov-ink2">
                    제도상 <b className="text-gov-ink">{won(diag.limits.available)}</b>까지 신청할 수
                    있지만, 소득이 해마다 흔들리는 것까지 넣으면 위 금액이 감당 가능한
                    범위입니다.
                  </p>
                  {unsafeGap(diag) > 0 && (
                    <p className="mt-2 text-[12px] font-semibold text-gov-point">
                      차이 {won(unsafeGap(diag))} 는 “빌릴 수는 있지만 갚기는 어려운” 구간입니다.
                    </p>
                  )}
                </div>
                <div className="min-w-0">
                  <RiskTriad d={diag} />
                </div>
              </div>

              {diag.limits.binding_constraint === "livelihood" && (
                <div className="mt-4">
                  <Notice tone="danger" title="대출 규모의 문제가 아닙니다">
                    대출을 0으로 놓아도 생활비를 감당하기 어려운 상태입니다. 한도를 낮추는
                    것으로는 풀리지 않고, 경영 규모를 늘리거나 생활비를 조정해야 합니다.
                  </Notice>
                </div>
              )}
            </Panel>
          </Section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="올해 현금 사정" action={
              <Link href="/app/revenue" className="text-[12px] text-gov-ink3 hover:text-gov-link">수익 전망 +</Link>
            }>
              <Panel>
                {cf ? (
                  <>
                    <div className="grid grid-cols-2 gap-5">
                      <Stat label="연 순현금" value={won(cf.annual_net)}
                            tone={cf.annual_net >= 0 ? "ok" : "danger"}
                            note={`${cf.year}년차 기준 (상환 ${won(cf.annual.debt_payment)})`} />
                      <Stat label="가장 빠듯한 달" value={`${cf.trough_month}월`}
                            tone={cf.working_capital_need > 0 ? "danger" : "plain"}
                            note={cf.working_capital_need > 0
                              ? `운전자금 ${won(cf.working_capital_need)} 부족`
                              : `그때도 ${won(cf.trough_balance)} 남습니다`} />
                    </div>
                    {!cf.harvest_known && (
                      <p className="mt-3 text-[12px] text-gov-warn">
                        이 작목은 출하월 정보가 없어 12개월 균등으로 펼쳤습니다.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-[13px] text-gov-ink3">현금흐름을 계산할 수 없습니다.</p>
                )}
              </Panel>
            </Section>

            <Section title="이 작목이 흔들리는 이유" action={
              <Link href="/app/safety" className="text-[12px] text-gov-ink3 hover:text-gov-link">안전진단 +</Link>
            }>
              <Panel>
                {crop?.factors ? (
                  <DefTable
                    rows={[
                      ["주 변동요인", <b key="a">{{ price: "가격", quantity: "수확량", cost: "경영비" }[crop.factors.driver]}</b>],
                      ["소득 변동성 σ", <span key="b" className="tabular">{diag.sigma.toFixed(3)}
                        <Badge tone={diag.sigma_personalized ? "info" : "plain"}>
                          {diag.sigma_personalized ? "내 이력 반영" : "작목 평균"}
                        </Badge></span>],
                      ["영업레버리지", crop.leverage
                        ? <span key="c" className="tabular">{crop.leverage.toFixed(2)}배</span>
                        : "—"],
                    ]}
                  />
                ) : (
                  <p className="text-[13px] text-gov-ink3">요인분해 자료가 없습니다.</p>
                )}
                <p className="mt-3 text-[12px] leading-relaxed text-gov-ink2">
                  영업레버리지가 크면 총수입이 조금만 빠져도 소득은 크게 빠집니다. 경영비는
                  매출이 줄어도 그대로 나가기 때문입니다.
                </p>
              </Panel>
            </Section>
          </div>

          <Section title="다음으로 할 일">
            <div className="grid gap-px bg-gov-line sm:grid-cols-3">
              {[
                ["수익 전망 보기", "/app/revenue", "월별로 어느 달에 현금이 마르는지 확인"],
                ["안전진단 받기", "/app/safety", "가격이 떨어져도 버티는지 시나리오별로 확인"],
                ["구제제도 확인", "/app/relief", "위기 전에 쓸 수 있는 제도 미리 파악"],
              ].map(([t, href, d]) => (
                <Link key={href} href={href} className="group bg-white p-5 hover:bg-gov-sunk">
                  <h3 className="text-[14px] font-bold text-gov-ink group-hover:text-gov-head">{t} →</h3>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-gov-ink2">{d}</p>
                </Link>
              ))}
            </div>
          </Section>
        </>
      )}
    </>
  );
}
