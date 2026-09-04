"use client";

import { SourceLegend } from "@/components/SourceTag";
import { sigmaSourceKind, sigmaSourceNote } from "@/lib/diagnosis";
import { useEffect, useState } from "react";
import { Badge, DefTable, Empty, Notice, PageTitle, Panel, Section, Stat } from "@/components/gov";
import CashflowChart from "@/components/gov/CashflowChart";
import { fetchCashflow, fetchCrop, runDiagnose, type Cashflow, type CropDetail, type Diagnosis } from "@/lib/api";
import { headlineLimit } from "@/lib/diagnosis";
import { useFarm } from "@/lib/useFarm";
import { won } from "@/lib/format";

export default function CapacityPage() {
  const { profile, ready } = useFarm();
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [crop, setCrop] = useState<CropDetail | null>(null);
  const [cf, setCf] = useState<Cashflow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    const base = {
      crop_id: profile.cropId, pyeong: profile.pyeong, living_cost: profile.livingCost,
      other_debt_service: profile.otherDebtService, product_id: profile.productId,
      // 실적을 base 에 둔다 — 진단에만 넣고 현금흐름에 안 넣으면 한 화면에서
      // 소득이 갈린다 (적대적 리뷰 F4, 2026-09-02).
      income_history: profile.incomeHistory,
    };
    runDiagnose(base)
      .then((d) => {
        setDiag(d);
        return Promise.all([
          fetchCrop(profile.cropId).then(setCrop),
          fetchCashflow({ ...base, principal: headlineLimit(d), year: d.product.grace_years + 1 })
            .then(setCf).catch(() => undefined),
        ]);
      })
      .catch(() => setError("계산에 실패했습니다."));
  }, [profile]);

  if (!ready) return null;
  if (!profile) {
    return (
      <>
        <PageTitle title="상환능력 분석" lead="차주 정보가 필요합니다." />
        <Empty title="차주 정보가 없습니다" body="농가 정보를 먼저 입력해 주세요."
               cta={{ href: "/app/farm", label: "차주 정보 입력" }} />
      </>
    );
  }

  return (
    <>
      <PageTitle
        title="상환능력 분석"
        lead="작목별 계절성과 가격 변동성을 반영합니다. 연 단위 DSCR만으로는 수확기 편중에서 오는 유동성 위험이 보이지 않습니다."
      />

      {error && <div className="mb-5"><Notice tone="danger">{error}</Notice></div>}

      {diag && (
        <Section title="상환여력 구성">
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel>
              <SourceLegend className="mb-4" />
              <DefTable rows={[
                ["연 총수입", <span key="a" className="tabular">{cf ? won(cf.annual.gross) : "—"}</span>,
                  { src: "public", note: "공표 10a당 총수입 × 차주 신고 면적." }],
                ["경영비", <span key="b" className="tabular">{cf ? `− ${won(cf.annual.operating_cost)}` : "—"}</span>,
                  { src: "public", note: "같은 조사의 경영비입니다. 조사연도는 작목마다 다릅니다." }],
                ["농업소득", <b key="c" className="tabular">{won(diag.income.annual)}</b>,
                  { src: "public" }],
                ["생활비", <span key="d" className="tabular">− {won(diag.input.living_cost)}</span>,
                  { src: "input", note: "차주가 적어 낸 값입니다. 검증 대상입니다." }],
                ["기존 부채상환", <span key="e" className="tabular">
                  {diag.input.other_debt_service ? `− ${won(diag.input.other_debt_service)}` : "없음"}
                </span>, { src: "input", note: "차주 신고 기준입니다. 신용정보로 대조해야 합니다." }],
                ["상환여력", <b key="f" className="tabular text-gov-head">{won(diag.income.capacity)}</b>],
              ]} />
            </Panel>
            <Panel>
              <h3 className="mb-3 text-[14px] font-bold text-gov-ink">변동성 구성</h3>
              <DefTable rows={[
                ["소득 변동성 σ", <span key="a" className="tabular">{diag.sigma.toFixed(3)}{" "}
                  <Badge tone={diag.sigma_personalized ? "info" : "warn"}>
                    {diag.sigma_personalized ? "차주 실적" : "작목 평균"}
                  </Badge></span>,
                  { src: sigmaSourceKind(diag), note: sigmaSourceNote(diag) }],
                ["시장 공통 성분", <span key="b" className="tabular">
                  {diag.sigma_common?.toFixed(3) ?? "—"} <span className="text-[12px] text-gov-ink3">실측</span>
                </span>, { src: "public", note: "작목 그룹의 공표 소득 시계열에서 실측했습니다." }],
                ["농가 고유 성분", <span key="c" className="tabular">
                  {diag.sigma_idiosyncratic.toFixed(3)}{" "}
                  <span className="text-[12px] text-gov-warn">
                    {diag.sigma_personalized ? "실측" : "가정"}
                  </span>
                </span>,
                  diag.sigma_personalized
                    ? { src: "input" as const, note: "차주 소득 이력에서 직접 계산했습니다." }
                    : { src: "assumed" as const, note: `실측 근거가 없어 ${diag.sigma_idiosyncratic.toFixed(2)} 로 두었습니다. 농가별 고유 변동을 공표하는 통계가 없습니다.` }],
                ["영업레버리지", <span key="d" className="tabular">
                  {crop?.leverage ? `${crop.leverage.toFixed(2)}배` : "—"}
                </span>, { src: "public" }],
                ["주 변동요인", crop?.factors
                  ? { price: "가격", quantity: "수확량", cost: "경영비" }[crop.factors.driver]
                  : "—"],
              ]} />
              {!diag.sigma_personalized && (
                <p className="mt-3 text-[12px] leading-relaxed text-gov-warn">
                  차주 소득 이력을 확보하면 고유 변동 성분이 가정값에서 실측으로 바뀝니다.
                  현재는 작목 평균이라 개별 차주의 실제 안정성과 다를 수 있습니다.
                </p>
              )}
            </Panel>
          </div>
        </Section>
      )}

      {cf && (
        <Section title="계절성 — 상환 시점의 유동성">
          <Panel>
            <div className="mb-4 grid gap-5 sm:grid-cols-3">
              <Stat label="출하월" value={cf.harvest_known ? `${cf.harvest_months.length}개월` : "미상"}
                    tone={cf.harvest_known ? "plain" : "warn"}
                    note={cf.harvest_known ? cf.harvest_months.map((m) => `${m}월`).join(", ") : "12개월 균등 배분"} />
              <Stat label="현금 최저 시점" value={`${cf.trough_month}월`}
                    tone={cf.working_capital_need > 0 ? "danger" : "plain"} />
              <Stat label={cf.working_capital_need > 0 ? "운전자금 소요" : "최저 시점 잔고"}
                    value={won(cf.working_capital_need > 0 ? cf.working_capital_need : cf.trough_balance)}
                    tone={cf.working_capital_need > 0 ? "danger" : "ok"} />
            </div>
            <CashflowChart months={cf.months} troughMonth={cf.trough_month} />
            {cf.working_capital_need > 0 && (
              <div className="mt-4">
                <Notice tone="warn" title="연 단위 DSCR로는 보이지 않는 위험">
                  연간 순현금은 {won(cf.annual_net)}로 {cf.annual_net >= 0 ? "양(+)" : "음(−)"}이지만,
                  {cf.trough_month}월 시점에 {won(cf.working_capital_need)}이 부족합니다. 운전자금
                  한도를 함께 설계하지 않으면 흑자 차주도 연체할 수 있습니다.
                </Notice>
              </div>
            )}
            <p className="mt-3 text-[12px] leading-relaxed text-gov-ink3">{cf.note}</p>
          </Panel>
        </Section>
      )}
    </>
  );
}
