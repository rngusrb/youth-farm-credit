"use client";

import Fold from "@/components/Fold";
import { useEffect, useState } from "react";
import { Btn, Empty, Notice, PageTitle, Panel, Section, Stat } from "@/components/gov";
import StressTable from "@/components/gov/StressTable";
import { fetchStress, runDiagnose, type Diagnosis, type StressReport } from "@/lib/api";
import { headlineLimit } from "@/lib/diagnosis";
import { useFarm } from "@/lib/useFarm";
import { pct, won } from "@/lib/format";

export default function SafetyPage() {
  const { profile, ready } = useFarm();
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [report, setReport] = useState<StressReport | null>(null);
  const [principal, setPrincipal] = useState<number | null>(null);
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
      .then((d) => { setDiag(d); setPrincipal((p) => p ?? headlineLimit(d)); })
      .catch(() => setError("계산에 실패했어요."));
  }, [profile]);

  useEffect(() => {
    if (!profile || principal == null) return;
    setBusy(true);
    fetchStress({
      crop_id: profile.cropId, pyeong: profile.pyeong, living_cost: profile.livingCost,
      other_debt_service: profile.otherDebtService, product_id: profile.productId, principal,
    })
      .then(setReport)
      .catch((e) => setError(e instanceof Error ? e.message : "스트레스 테스트 실패"))
      .finally(() => setBusy(false));
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
