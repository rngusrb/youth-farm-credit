"use client";

import Fold from "@/components/Fold";
import { useEffect, useState } from "react";
import { Btn, Empty, Notice, PageTitle, Panel, Section, Stat } from "@/components/gov";
import StressTable from "@/components/gov/StressTable";
import { fetchBreakingPoint, fetchStress, runDiagnose,
         type BreakingPoint, type Diagnosis, type StressReport } from "@/lib/api";
import { headlineLimit } from "@/lib/diagnosis";
import { useFarm } from "@/lib/useFarm";
import { pct, won } from "@/lib/format";

export default function SafetyPage() {
  const { profile, ready } = useFarm();
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [report, setReport] = useState<StressReport | null>(null);
  const [principal, setPrincipal] = useState<number | null>(null);
  const [edge, setEdge] = useState<BreakingPoint | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 가격 하락 시나리오. 설명 문구와 소득 감소율 모두 엔진이 낸 값을 그대로 쓴다. */
  const priceCase = report?.scenarios.find((s) => s.key === "price") ?? null;

  useEffect(() => {
    if (!profile) return;
    runDiagnose({
      crop_id: profile.cropId, pyeong: profile.pyeong, living_cost: profile.livingCost,
      other_debt_service: profile.otherDebtService, product_id: profile.productId,
      income_history: profile.incomeHistory,
    })
      .then((d) => {
        setDiag(d);
        // 농가가 실제로 빌리려는 금액을 먼저 쓴다. 권장 차입을 기본으로 두면
        // **정의상** 여유가 0이라 「버틸 수 있는 선」이 늘 0% 로 나온다 —
        // 계산은 맞지만 화면이 아무것도 못 알려준다. (2026-09-06)
        setPrincipal((prev) => prev ?? profile.targetPrincipal ?? headlineLimit(d));
      })
      .catch(() => setError("계산에 실패했어요."));
  }, [profile]);

  useEffect(() => {
    if (!profile || principal == null) return;
    setBusy(true);
    fetchStress({
      crop_id: profile.cropId, pyeong: profile.pyeong, living_cost: profile.livingCost,
      other_debt_service: profile.otherDebtService, product_id: profile.productId, principal,
      // 진단에만 실적을 보내고 여기 안 보내면 한 화면에서 소득이 갈린다
      // (적대적 리뷰 H1, 2026-09-02: 진단 9,100만원 / 시나리오 6,304만원).
      income_history: profile.incomeHistory,
    })
      .then(setReport)
      .catch((e) => setError(e instanceof Error ? e.message : "스트레스 테스트 실패"))
      .finally(() => setBusy(false));

    // 「버틸 수 있는 선」은 보조가 아니라 이 화면의 답이다. 다만 실패해도
    // 시나리오 표는 보여준다 — 한쪽이 죽는다고 화면 전체를 비우지 않는다.
    fetchBreakingPoint({
      crop_id: profile.cropId, pyeong: profile.pyeong, living_cost: profile.livingCost,
      other_debt_service: profile.otherDebtService, product_id: profile.productId, principal,
      income_history: profile.incomeHistory,
    })
      .then(setEdge)
      .catch(() => setEdge(null));
  }, [profile, principal]);

  if (!ready) return null;
  if (!profile) {
    return (
      <>
        <PageTitle title="금융 안전진단" lead="농가 정보가 있어야 계산해요." />
        <Empty title="농가 정보가 없어요" body="작목과 면적을 먼저 입력해 주세요."
               cta={{ href: "/app/farm", label: "내 농장정보 입력" }} />
      </>
    );
  }

  const failed = report?.scenarios.filter((s) => !s.survives && s.key !== "base") ?? [];

  return (
    <>
      <PageTitle
        title="금융 안전진단"
        lead="평균적으로 얼마나 위험한가가 아니라, 특정한 나쁜 일이 실제로 일어나면 버티는지를 봐요."
      />

      {error && <div className="mb-5"><Notice tone="danger">{error}</Notice></div>}

      {diag && (
        <Section title="평가 조건">
          <Panel>
            <div className="flex flex-wrap items-end gap-6">
              <div>
                <label htmlFor="principal" className="mb-1.5 block text-[13px] font-semibold text-gov-ink2">
                  빌릴 금액
                </label>
                <div className="flex items-center gap-2">
                  <input id="principal" inputMode="numeric"
                         value={principal != null ? Math.round(principal / 10_000) : ""}
                         onChange={(e) => setPrincipal(Number(e.target.value.replace(/[^\d]/g, "")) * 10_000)}
                         className="tabular w-32 min-h-11 rounded-md border border-gov-line px-3 text-right text-[14px] outline-none focus:border-gov-link" />
                  <span className="text-[13px] text-gov-ink3">만원</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  ["권장", headlineLimit(diag)],
                  ["은행이 보는 선", diag.limits.recommended],
                  ["제도 한도", diag.limits.available],
                ].map(([l, v]) => (
                  <button key={l as string} onClick={() => setPrincipal(v as number)}
                          className="inline-flex min-h-11 items-center rounded-md border border-gov-line px-3 text-[12px] text-gov-ink2 hover:border-gov-link hover:text-gov-head">
                    {l as string} {won(v as number)}
                  </button>
                ))}
              </div>
              {report && (
                <div className="ml-auto flex gap-6">
                  {/* 규칙 4 — 뜻이 라벨, 용어는 note 로 남긴다 (지우지 않는다) */}
                  <Stat label="수입이 줄면 소득은" value={`${report.leverage.toFixed(2)}배 줄어요`}
                        note={`영업레버리지 ${report.leverage.toFixed(2)} · 들어온 돈 ÷ 소득`} />
                  <Stat label="보통 해에 얼마쯤"
                        value={`${won(diag.income.band_p10_p90[0])}~${won(diag.income.band_p10_p90[1])}`}
                        note={`10년 중 8년이 이 사이 · 소득이 흔들리는 정도 σ ${report.sigma.toFixed(3)}`} />
                </div>
              )}
            </div>
          </Panel>
        </Section>
      )}

      {report && (
        <>
          {failed.length > 0 && (
            <div className="mb-5">
              <Notice tone="danger" title={`${failed.length}개 시나리오에서 대출 갚기가 어려울 수 있어요`}>
                {failed.map((f) => f.label).join(", ")} 상황에서 2년 연속 위기 확률이 감내
                기준을 넘어요. 빌리는 금액을 줄이거나, 아래 대응을 미리 준비해 두시기 바라요.
              </Notice>
            </div>
          )}

          {/* 이 화면의 답을 맨 위에 둔다. 시나리오 표는 "남의 가정" 이라 거의 다
              '못 버팀' 으로 나오는데, 그것만 보면 농가는 "그래서 어쩌라고" 가 남는다.
              경계는 **이 농가만의 숫자**다. (2026-09-06) */}
          {edge && (
            <Section title="내가 버틸 수 있는 선">
              <Panel>
                {edge.status === "found" && edge.drop !== null && edge.drop >= 0.01 ? (
                  <>
                    <p className="text-[15px] leading-relaxed text-gov-head">
                      농사로 버는 돈이 지금보다{" "}
                      <b className="text-[22px] tabular text-gov-link">{pct(edge.drop)}</b>{" "}
                      줄어드는 데까지는 대출을 갚을 수 있어요.
                    </p>
                    {edge.ladder.length > 1 && (
                      <>
                        <p className="mt-4 text-[13px] font-semibold text-gov-ink2">
                          그 아래로는 이렇게 가팔라져요
                        </p>
                        <ul className="mt-2 space-y-1.5">
                          {edge.ladder.map(([drop, prob]) => (
                            <li key={drop} className="flex items-center gap-3 text-[13px]">
                              <span className="tabular w-24 shrink-0 text-gov-ink2">
                                {pct(drop)} 줄면
                              </span>
                              <span className="h-2 max-w-[220px] flex-1 rounded-full bg-gov-line2">
                                <span
                                  className={`block h-2 rounded-full ${prob > edge.max_crisis_prob ? "bg-gov-warn" : "bg-gov-ok2"}`}
                                  style={{ width: `${Math.min(100, prob * 100)}%` }}
                                />
                              </span>
                              <span className="tabular w-16 shrink-0 text-right text-gov-head">
                                {pct(prob)}
                              </span>
                            </li>
                          ))}
                        </ul>
                        <p className="mt-1.5 text-[12px] text-gov-ink3">
                          막대는 2년 연속 갚기 어려울 확률이에요. 감내 기준은{" "}
                          {pct(edge.max_crisis_prob)} 이고, 넘으면 주황색으로 표시해요.
                        </p>
                      </>
                    )}
                  </>
                ) : (
                  <p className="text-[15px] leading-relaxed text-gov-head">
                    {edge.status === "already_over"
                      ? "지금 빌리려는 금액은 값이 떨어지지 않아도 이미 부담이 커요."
                      : edge.status === "unbreakable"
                        ? "농사로 버는 돈이 크게 줄어도 이 금액은 갚을 수 있어요."
                        : "지금 빌리려는 금액은 여유가 거의 없어요. 농사로 버는 돈이 조금만 줄어도 갚기 어려워져요."}
                  </p>
                )}
                <Notice tone="info" title="이 숫자가 뜻하는 것">{edge.note}</Notice>
              </Panel>
            </Section>
          )}

          <Section title={busy ? "다시 계산 중…" : "상황별로 대출을 갚을 수 있는지"}>
            <StressTable scenarios={report.scenarios} tolerance={report.tolerance} />
          </Section>

          <Section title="왜 이렇게 크게 흔들리나">
            <Panel>
              {/* 규칙 4 — 뜻을 먼저 말하고 용어는 끝에. 숫자·시나리오 설명은 엔진 값 그대로. */}
              <p className="text-[14px] leading-relaxed text-gov-ink2">
                농사 비용는 매출이 줄어도 그대로 나가요. 그래서 수입이 줄면 소득은 그보다
                크게 줄어요 — 이 농가는{" "}
                <b className="text-gov-ink">{report.leverage.toFixed(2)}배</b>예요.
              </p>
              {priceCase && (
                <p className="mt-2 text-[13px] leading-relaxed text-gov-ink2">
                  {priceCase.detail} 상황이면 소득이{" "}
                  <b className="text-gov-point">{pct(Math.abs(priceCase.income_change))}</b>{" "}
                  줄어요.
                </p>
              )}
              <p className="mt-2 text-[12px] text-gov-ink3">영업레버리지 {report.leverage.toFixed(2)} · 들어온 돈 ÷ 소득</p>
            </Panel>

            {/* 가정·한계는 결론이 아니다. 지우지 않고 접는다 (UX-001). */}
            <div className="mt-3">
              <Fold
                tone="gov"
                summary="이 계산이 둔 가정과 한계"
                hint="펼쳐 보기"
              >
                <p className="text-[13px] leading-relaxed text-gov-ink2">
                  계산에서 농사 비용는 줄어들지 않는 것으로 둬요. 실제로는 수확 관련 비용이 일부
                  줄지만 그 비율에 대한 공개 근거가 없어 지어내지 않았어요. 그만큼 이 결과는
                  보수적이에요.
                </p>
                <p className="mt-2.5 text-[13px] leading-relaxed text-gov-ink2">
                  반대로 재해 시 이자 감면과 농신보 보증료는 넣지 않았어요. 앞의 것은 결과를
                  나쁘게, 뒤의 것은 좋게 기울어요. 어느 쪽이 더 큰지는 저희도 재보지
                  않았어요.
                </p>
              </Fold>
            </div>
          </Section>

          <Section title="대응">
            <ol className="border-t border-gov-ink/70">
              {[
                ["빌리는 금액을 줄인다", `현재 평가 중인 ${won(report.principal)} 대신 권장 금액으로 낮추면 모든 시나리오의 위험이 함께 내려가요.`],
                ["출하 시기를 나눈다", "한 시점의 시세에 한 해 소득이 걸리지 않게 해요. 계약재배나 수매 약정으로 판매가를 미리 묶는 방법도 있어요."],
                ["재해 대응을 미리 확인한다", "피해율 30% 이상이면 상환기한 연기가 가능해요. 요건과 신청 경로를 미리 알아 두는 것과 사후에 알아보는 것은 다릅니다."],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-4 border-b border-gov-line2 px-1 py-3.5">
                  <span className="tabular w-5 shrink-0 font-extrabold text-gov-link">{i + 1}</span>
                  <div>
                    <p className="text-[14px] font-semibold text-gov-ink">{t}</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-gov-ink2">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Section>

          <div className="flex gap-2">
            <Btn href="/app/finance">대출 계획 보기</Btn>
            <Btn href="/app/relief" variant="ghost">어려울 때 받을 도움 확인</Btn>
          </div>
        </>
      )}
    </>
  );
}
