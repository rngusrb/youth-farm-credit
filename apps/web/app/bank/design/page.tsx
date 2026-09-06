"use client";

import Fold from "@/components/Fold";
import { SourceLegend } from "@/components/SourceTag";
import { useEffect, useState } from "react";
import { Badge, Btn, DefTable, Empty, Notice, PageTitle, Panel, Section, Stat } from "@/components/gov";
import { fetchProducts, runDiagnose, type Diagnosis, type ProductRow } from "@/lib/api";
import { headlineLimit, unsafeGap } from "@/lib/diagnosis";
import { useFarm } from "@/lib/useFarm";
import { pct, ratio, won } from "@/lib/format";

/** 적정 여신 설계.
 *
 * 실행 금액을 바꿔 가며 위험이 어떻게 변하는지 본다. 계산은 서버가 하고
 * 화면은 받은 값을 그릴 뿐이다 — 프런트에서 보간하면 리포트와 숫자가 갈린다.
 */
export default function DesignPage() {
  const { profile, ready } = useFarm();
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [productId, setProductId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProducts().then((p) => setProducts(p.products)).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!profile) return;
    runDiagnose({
      crop_id: profile.cropId, pyeong: profile.pyeong, living_cost: profile.livingCost,
      other_debt_service: profile.otherDebtService,
      product_id: productId ?? profile.productId,
      income_history: profile.incomeHistory,
    }).then(setDiag).catch(() => setError("계산에 실패했습니다."));
  }, [profile, productId]);

  if (!ready) return null;
  if (!profile) {
    return (
      <>
        <PageTitle title="대출 금액 계획" lead="차주 정보가 필요합니다." />
        <Empty title="차주 정보가 없습니다" body="농가 정보를 먼저 입력해 주세요."
               cta={{ href: "/app/farm", label: "차주 정보 입력" }} />
      </>
    );
  }

  const band = diag?.uncertainty;

  return (
    <>
      <PageTitle
        title="대출 금액 계획"
        lead="빌려줄 금액에 따라 위험을 비교해요. 소득이 줄어드는 상황까지 반영한 권장 대출금도 확인할 수 있어요."
      />

      {error && <div className="mb-5"><Notice tone="danger">{error}</Notice></div>}

      {diag && (
        <>
          <Section title="상품 선택">
            <Panel>
              <div className="flex flex-wrap gap-2">
                {products.map((p) => {
                  const on = (productId ?? profile.productId) === p.id;
                  return (
                    <button key={p.id} onClick={() => setProductId(p.id)} aria-pressed={on}
                            className={`border px-4 py-2.5 text-left ${
                              on ? "border-gov-head bg-gov-soft" : "border-gov-line hover:border-gov-link"}`}>
                      <span className={`block text-[13px] font-bold ${on ? "text-gov-head" : "text-gov-ink"}`}>
                        {p.name}
                      </span>
                      <span className="block text-[12px] text-gov-ink3">
                        한도 {won(p.limit)} · {p.grace_years}년 동안 이자만 · {p.amort_years}년 · 연 {(p.rate * 100).toFixed(1)}%
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-gov-ink3">
                상환기간이 짧을수록 같은 원금의 한 해 갚을 돈이 커집니다. 20년과 10년은 1억원당
                연 650만원과 1,150만원으로 1.77배 차이가 납니다.
              </p>
            </Panel>
          </Section>

          <Section title="권장 실행 금액">
            <Panel>
              <div className="grid gap-6 sm:grid-cols-3">
                <Stat label="신청 가능" value={won(diag.limits.available)} note="제도상 한도"
                      src="public" srcNote={diag.product.source} />
                <Stat label="권장 실행" value={won(headlineLimit(diag))} tone="ok"
                      note={`2년연속 위기확률 ${pct(diag.limits.max_crisis_prob)} 이하 유지`} />
                <Stat label="과다 구간" value={won(unsafeGap(diag))}
                      tone={unsafeGap(diag) > 0 ? "danger" : "plain"}
                      note="실행 시 위험 기준 초과" />
              </div>
            </Panel>
          </Section>

          <Section title="이 설계가 선 가정">
            <SourceLegend className="mb-3" />
            <Fold
              tone="gov"
              summary="가정값 3건 — 각각의 근거"
              hint="펼쳐 보기"
            >
              <DefTable rows={[
                ["농가 고유 변동성",
                 <span key="a" className="tabular">{diag.sigma_idiosyncratic.toFixed(2)}</span>,
                 diag.sigma_personalized
                   ? { src: "input", note: "차주 소득 이력에서 계산했습니다." }
                   : { src: "assumed", note: "근거가 없습니다 — 농가별 고유 변동을 공표하는 통계를 찾지 못했습니다." }],
                ["연간 재해 발생확률",
                 <span key="b" className="tabular">{pct(diag.assumptions.p_disaster)}</span>,
                 { src: "assumed", note: "지역·작목별 실측값이 아닙니다. 피해율은 30~80% 균등으로 둡니다." }],
                ["농신보 보증료",
                 <span key="c" className="text-gov-ink3">계산에 넣지 않음</span>,
                 { src: "assumed", note: "요율이 공개되어 있지 않아 뺐습니다. 그만큼 이 결과는 낙관적입니다." }],
              ]} />
              <p className="mt-3 text-[12px] leading-relaxed text-gov-ink3">
                재해 시 이자 감면도 넣지 않았습니다. 앞의 세 가정과 방향이 반대라 서로 얼마나
                상쇄되는지는 재보지 않았습니다.
              </p>
            </Fold>
          </Section>

          <Section title="실행 금액별 위험">
            <div className="table-scroll overflow-x-auto" tabIndex={0} role="region" aria-label="표 또는 차트 상세 · 좌우로 스크롤">
              <table className="w-full min-w-[680px] border-t border-gov-ink/70 text-[14px]">
                <thead>
                  <tr className="bg-gov-sunk text-right text-[12px] font-semibold text-gov-ink2">
                    <th scope="col" className="border-b border-gov-line px-4 py-3 text-left">실행 금액</th>
                    <th scope="col" className="border-b border-gov-line px-4 py-3">이자만 낼 때의 한 해 이자</th>
                    <th scope="col" className="border-b border-gov-line px-4 py-3">절벽 연차 갚을 돈</th>
                    <th scope="col" className="border-b border-gov-line px-4 py-3">DSCR</th>
                    <th scope="col" className="border-b border-gov-line px-4 py-3">2년연속 위기</th>
                    <th scope="col" className="border-b border-gov-line px-4 py-3 text-center">판단</th>
                  </tr>
                </thead>
                <tbody className="tabular text-right">
                  {([
                    ["제도 한도", diag.limits.available, diag.scenarios.at_available],
                    ["DSCR 기준", diag.limits.recommended, diag.scenarios.at_recommended],
                    ["위험기반 권장", headlineLimit(diag), diag.scenarios.at_risk_based],
                  ] as const).map(([label, amount, sc]) => {
                    const ok = (sc?.crisis_prob ?? 1) <= diag.limits.max_crisis_prob;
                    return (
                      <tr key={label} className="border-b border-gov-line2">
                        <th scope="row" className="px-4 py-3 text-left font-medium text-gov-ink">
                          {label}
                          <span className="block text-[12px] font-normal text-gov-ink3">{won(amount)}</span>
                        </th>
                        <td className="px-4 py-3 text-gov-ink2">{won(sc?.grace_payment ?? 0)}</td>
                        <td className="px-4 py-3 text-gov-ink2">
                          {won(sc?.amort_payment ?? 0)}
                          <span className="block text-[12px] text-gov-point">
                            {(sc?.cliff_multiple ?? 0).toFixed(1)}배
                          </span>
                        </td>
                        <td className={`px-4 py-3 ${(sc?.dscr_median ?? 0) < 1 ? "text-gov-point" : "text-gov-ink2"}`}>
                          {ratio(sc?.dscr_median ?? 0)}
                        </td>
                        <td className={`px-4 py-3 font-semibold ${ok ? "text-gov-ink" : "text-gov-point"}`}>
                          {pct(sc?.crisis_prob ?? 0)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge tone={ok ? "ok" : "danger"}>{ok ? "적정" : "과다"}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          {band && (
            <Section title="추정 불확실성">
              <Panel>
                <p className="mb-4 text-[13px] leading-relaxed text-gov-ink2">
                  변동성 σ 자체가 추정값입니다. σ를 위아래로 흔들었을 때 권장 금액이 얼마나
                  움직이는지 보면, 이 숫자를 얼마나 믿어도 되는지 알 수 있습니다.
                </p>
                <div className="grid gap-6 sm:grid-cols-3">
                  <Stat label="권장 금액 범위"
                        value={`${won(band.risk_limit_low)} ~ ${won(band.risk_limit_high)}`} />
                  <Stat label="위기확률 범위"
                        value={`${pct(band.crisis_prob_low)} ~ ${pct(band.crisis_prob_high)}`} />
                  <Stat label="손익분기 σ"
                        value={band.break_even_sigma ? band.break_even_sigma.toFixed(3) : "—"}
                        note="이 값을 넘으면 권장 금액에서도 기준 초과" />
                </div>
                <div className="table-scroll mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="표 상세 · 좌우로 스크롤">
                  <table className="w-full min-w-[520px] border-t border-gov-line text-[13px]">
                    <thead>
                      <tr className="bg-gov-sunk text-right text-[12px] font-semibold text-gov-ink2">
                        <th scope="col" className="border-b border-gov-line px-3 py-2 text-left">σ</th>
                        <th scope="col" className="border-b border-gov-line px-3 py-2">위기확률</th>
                        <th scope="col" className="border-b border-gov-line px-3 py-2">DSCR</th>
                        <th scope="col" className="border-b border-gov-line px-3 py-2">권장 금액</th>
                      </tr>
                    </thead>
                    <tbody className="tabular text-right">
                      {band.sigma_grid.map((g) => (
                        <tr key={g.sigma} className={`border-b border-gov-line2 ${
                          Math.abs(g.sigma - diag.sigma) < 1e-6 ? "bg-gov-soft font-semibold" : ""}`}>
                          <th scope="row" className="px-3 py-2 text-left">{g.sigma.toFixed(3)}</th>
                          <td className="px-3 py-2">{pct(g.crisis_prob)}</td>
                          <td className="px-3 py-2">{ratio(g.dscr_median)}</td>
                          <td className="px-3 py-2">{won(g.risk_limit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </Section>
          )}

          <div className="flex gap-2">
            <Btn href="/bank/stress">Stress Test 실행</Btn>
            <Btn href={`/result/${diag.diagnosis_id}`} variant="ghost">심사 리포트</Btn>
          </div>
        </>
      )}
    </>
  );
}
