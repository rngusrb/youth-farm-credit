"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  ACTION_HREF,
  explain,
  fetchDiagnosis,
  type Diagnosis,
  type Explanation,
} from "@/lib/api";
import { manwon, pct, pyeong as fmtPyeong, won } from "@/lib/format";
import { headlineLimit, headlineScenario, unsafeGap } from "@/lib/diagnosis";
import { saveReport } from "@/lib/profile";
import AssumedBadge from "@/components/AssumedBadge";
import CliffChart from "@/components/CliffChart";
import DscrGauge from "@/components/DscrGauge";
import LimitLadder from "@/components/LimitLadder";
import MarketRegime from "@/components/MarketRegime";
import RegulationAsk from "@/components/RegulationAsk";
import ReportCover from "@/components/ReportCover";
import ReportSection from "@/components/ReportSection";
import RiskDriver from "@/components/RiskDriver";
import RiskSummary from "@/components/RiskSummary";
import SigmaBand from "@/components/SigmaBand";

type Key = "at_available" | "at_recommended" | "at_risk_based";

/**
 * 결과 화면은 대시보드가 아니라 **리포트**다. 읽는 사람은 지표를 훑으러 온 게
 * 아니라 답을 받으러 왔다. 그래서 순서가 결론 → 이유 → 위험 → 대응 → 근거다.
 * 분석 자료(요인분해·교차검증·불확실성)는 결론을 떠받치는 자리인 뒤쪽에 둔다.
 */
export default function ResultPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Diagnosis | null>(null);
  const [note, setNote] = useState<Explanation | null>(null);
  const [scenarioKey, setScenarioKey] = useState<Key>("at_available");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchDiagnosis(id)
      .then((d) => {
        if (!alive) return;
        setData(d);
        // 이 브라우저의 기록에 남긴다. 서버에는 아무것도 저장하지 않는다 —
        // 입력값은 이미 문서번호에 들어 있어서 링크가 곧 저장이다.
        const s = headlineScenario(d);
        saveReport({
          id: d.diagnosis_id,
          cropName: d.input.crop_name,
          pyeong: d.input.pyeong,
          productName: d.product.name,
          riskLimit: headlineLimit(d),
          crisisProb: s?.crisis_prob ?? 0,
          savedAt: Date.now(),
        });
        return explain(d).then((e) => alive && setNote(e));
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "불러오기 실패"));
    return () => {
      alive = false;
    };
  }, [id]);

  const scenario = useMemo(() => data?.scenarios?.[scenarioKey] ?? null, [data, scenarioKey]);
  const schedule = useMemo(() => {
    if (!data) return [];
    return data.schedules?.[scenarioKey] ?? data.schedule;
  }, [data, scenarioKey]);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16">
        <p className="border-l-4 border-gov-point bg-gov-point/5 px-4 py-3 text-[14px] text-gov-point">
          {error}
        </p>
        <a href="/" className="mt-4 inline-flex min-h-11 items-center text-[14px] text-gov-link hover:underline">
          다시 진단하기 →
        </a>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16 text-[14px] text-gov-ink2">
        리포트를 준비하는 중입니다…
      </main>
    );
  }

  const ok = data.status === "ok";
  const shortfall = data.min_area_pyeong - data.input.pyeong;

  // 절 번호는 실제로 실린 절에만, 렌더 순서대로 매긴다. 상환여력이 없으면 01~03 이
  // 통째로 빠지는데, 그때 04 부터 시작하면 앞이 잘려 나간 문서처럼 보인다.
  let counter = 0;
  const next = () => String(++counter).padStart(2, "0");

  return (
    <main id="main" className="pb-4">
      <article className="sheet mx-auto max-w-[46rem] rounded-md px-6 py-12 sm:px-14 sm:py-16">
        <ReportCover data={data} />

        <div className="mt-16">
        {/* ── 01 결론 ─────────────────────────────────── */}
        {ok && (
          <ReportSection
            n={next()}
            title="세 가지 한도"
            lead={`같은 농가인데 기준에 따라 ${won(unsafeGap(data))}이 벌어집니다.`}
          >
            <LimitLadder
              available={data.limits.available}
              recommended={data.limits.recommended}
              riskBased={data.limits.risk_based}
              targetDscr={data.target_dscr}
              maxCrisisProb={data.limits.max_crisis_prob}
              crisisAtAvailable={data.scenarios.at_available.crisis_prob}
              crisisAtRecommended={data.scenarios.at_recommended.crisis_prob}
              crisisAtRiskBased={data.scenarios.at_risk_based?.crisis_prob ?? null}
              binding={data.limits.binding_constraint}
              livelihoodFloorProb={data.limits.livelihood_floor_prob}
            />
          </ReportSection>
        )}

        {/* ── 02 왜 그런가 ────────────────────────────── */}
        {ok && scenario && (
          <ReportSection
            n={next()}
            title={`${data.product.grace_years + 1}년차부터 왜 어려울까요`}
            lead={`처음 ${data.product.grace_years}년은 이자만 냅니다. 거치가 끝나는 ${data.product.grace_years + 1}년차에 원금이 붙으면서 연 상환액이 최댓값을 찍고, 이후 매년 줄어듭니다. 즉 ${data.product.grace_years + 1}년차는 우연히 위험한 해가 아니라 구조적으로 가장 무거운 해입니다.`}
            aside={
              <div className="inline-flex rounded-lg border border-paper-rule p-0.5">
                {(
                  [
                    ["at_available", "한도"],
                    ["at_recommended", "DSCR"],
                    ["at_risk_based", "위험기준"],
                  ] as [Key, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setScenarioKey(key)}
                    className={`inline-flex min-h-11 items-center rounded-md px-3 transition ${
                      scenarioKey === key
                        ? "bg-paper-ink font-semibold text-paper-panel"
                        : "text-paper-ink2 hover:text-paper-ink"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            }
          >
            <div className="rounded-xl border border-paper-rule bg-paper-panel p-4">
              <CliffChart
                schedule={schedule}
                capacity={data.income.capacity}
                graceYears={data.product.grace_years}
                firstRiskYear={scenario.first_risk_year}
              />
              <p className="mt-3 text-xs leading-relaxed text-paper-ink3">
                거치 {data.product.grace_years}년 연 이자{" "}
                <span className="tabular text-paper-ink2">
                  {manwon(scenario.grace_payment)}
                </span>{" "}
                →{" "}
                {data.product.grace_years + 1}년차{" "}
                <span className="tabular font-semibold text-paper-ink">
                  {manwon(scenario.amort_payment)}
                </span>{" "}
                ({scenario.cliff_multiple.toFixed(2)}배)로 뛴 뒤, 원금 몫이 고정이라
                이자분만큼 매년 줄어 마지막 해{" "}
                <span className="tabular text-paper-ink2">
                  {manwon(scenario.amort_payment_last)}
                </span>{" "}
                가 됩니다. 연리 {(data.product.rate * 100).toFixed(1)}% ·{" "}
                {data.product.amort_years}년 원금 균등분할.
              </p>
            </div>

            <div className="mt-4 rounded-xl border border-paper-rule bg-paper-panel p-5">
              <h3 className="mb-4 flex items-center text-sm font-semibold text-paper-ink">
                상환능력비율 (DSCR)
                <AssumedBadge
                  source={data.sigma_source}
                  assumedShare={data.sigma_assumed_share}
                />
              </h3>
              <DscrGauge
                median={scenario.dscr_median}
                p10={scenario.dscr_p10}
                worst={scenario.dscr_first_amort}
                worstYear={data.product.grace_years + 1}
                target={data.target_dscr}
              />
            </div>
          </ReportSection>
        )}

        {/* ── 03 얼마나 위험한가 ──────────────────────── */}
        {ok && scenario && (
          <ReportSection
            n={next()}
            title="얼마나 위험할까요"
            lead="소득이 흔들리는 25년을 3만 번 시뮬레이션해 센 결과입니다. 1년 부족은 저축으로 버티지만, 2년 연속은 돌려막기의 시작입니다."
          >
            <RiskSummary
              scenario={scenario}
              sigmaSource={data.sigma_source}
              assumedShare={data.sigma_assumed_share}
            />
          </ReportSection>
        )}

        {/* ── 04 작목의 성격 ──────────────────────────── */}
        {data.factors && (
          <ReportSection
            n={next()}
            title="이 작목의 소득이 흔들리는 이유"
            lead="원인이 가격인지 수확량인지에 따라 대응이 완전히 달라집니다."
          >
            <RiskDriver factors={data.factors} cropName={data.input.crop_name} />
          </ReportSection>
        )}

        {/* ── 05 선택지 ───────────────────────────────── */}
        <ReportSection
          n={next()}
          title="어떻게 하면 좋을까요"
          lead={
            note?.actions.length
              ? undefined
              : "차입 규모를 줄이거나, 재배 규모를 키우거나, 제도의 유예 장치를 미리 확인해 두는 세 갈래가 있습니다."
          }
        >
          {note && (
            <div className="mb-4 rounded-xl border border-paper-rule bg-paper-panel p-5">
              <h3 className="text-sm font-semibold text-paper-ink">{note.headline}</h3>
              <p className="mt-2 text-sm leading-relaxed text-paper-ink2">{note.body}</p>
              {note.actions.length > 0 && (
                <ul className="mt-4 space-y-3.5">
                  {note.actions.map((a, i) => {
                    const to = a.link ? ACTION_HREF[a.link] : null;
                    return (
                      <li key={i} className="border-l-2 border-paper-rule pl-3.5">
                        <p className="text-sm font-semibold leading-snug text-paper-ink">{a.text}</p>
                        {a.detail && (
                          <p className="mt-1 text-[13px] leading-relaxed text-paper-ink2">
                            {a.detail}
                          </p>
                        )}
                        {to && (
                          <a
                            href={to.href}
                            className="no-print mt-0.5 inline-flex min-h-11 items-center text-[12px] font-medium text-paper-accent"
                          >
                            {to.label}에서 보기 →
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          <dl className="grid gap-4 rounded-xl border border-paper-rule bg-paper-panel p-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-paper-ink3">
                한도({won(data.limits.available)}) 차입 시 최소 필요면적
              </dt>
              <dd className="tabular mt-1 text-xl font-semibold text-paper-ink">
                {fmtPyeong(data.min_area_pyeong)}
              </dd>
              <p className="mt-1 text-[12px] text-paper-ink3">
                현재 {fmtPyeong(data.input.pyeong)} 대비{" "}
                {shortfall > 0 ? `${fmtPyeong(shortfall)} 부족` : "충족"}
              </p>
            </div>
            <div>
              <dt className="text-xs text-paper-ink3">재해 시 상환유예</dt>
              <dd className="mt-1 text-sm leading-relaxed text-paper-ink2">
                피해율 30~50% 1년, 50% 이상 2년 연기. 할부유예는 최대{" "}
                {data.assumptions.installment_defer_max_count}회.
              </dd>
              <p className="mt-1 text-[12px] text-paper-ink3">
                농업자금이차보전 사업시행지침 — 농가단위 피해율 기준
              </p>
            </div>
          </dl>
        </ReportSection>

        {/* ── 06 이 계산의 근거 ───────────────────────── */}
        <ReportSection
          n={next()}
          title="이 보고서가 쓴 근거"
          lead="여기부터는 위 결론이 어디서 나왔는지에 대한 자료입니다. 결론만 필요하시면 건너뛰셔도 됩니다."
        >
          <div className="space-y-4">
            {data.market && <MarketRegime market={data.market} />}
            {data.uncertainty && (
              <SigmaBand
                uncertainty={data.uncertainty}
                sigma={data.sigma}
                sigmaSource={data.sigma_source}
                personalized={data.sigma_personalized}
                sigmaNote={data.sigma_note}
                sigmaCi={data.sigma_ci}
                sigmaCommon={data.sigma_common}
                assumedShare={data.sigma_assumed_share}
                ciScope={data.sigma_ci_scope}
                sigmaIdiosyncratic={data.sigma_idiosyncratic}
                sigmaReference={data.sigma_reference}
                maxCrisisProb={data.limits.max_crisis_prob}
                recommended={data.limits.recommended}
              />
            )}

            <div className="rounded-xl border border-paper-rule bg-paper-panel p-5">
              <h3 className="text-sm font-semibold text-paper-ink">계산 전제</h3>
              <dl className="mt-3 space-y-2 text-xs leading-relaxed text-paper-ink2">
                <Assumption k="소득 기준">
                  농촌진흥청 2023년 농산물 소득조사 10a당 소득에 면적을 비례 적용.
                  규모의 경제는 반영되어 있지 않습니다.
                </Assumption>
                <Assumption k="소득 변동성">
                  σ={data.sigma.toFixed(2)} —{" "}
                  {data.sigma_source === "PERSONAL" ? (
                    <>입력하신 소득 이력에서 직접 계산했습니다.</>
                  ) : data.sigma_common ? (
                    <>
                      시장 공통 변동{" "}
                      <b className="text-paper-ink">{data.sigma_common.toFixed(3)}</b>는
                      실측, 농가 고유 변동{" "}
                      <b className="text-paper-ink">
                        {data.sigma_idiosyncratic.toFixed(2)}
                      </b>
                      는 가정값입니다. 둘을 제곱합해 σ 를 냅니다.{" "}
                      <b className="text-paper-accent">
                        분산 기준 {Math.round((data.sigma_assumed_share ?? 0) * 100)}%가
                        가정
                      </b>
                      이므로 전체를 실측이라고 부르지 않습니다.
                    </>
                  ) : (
                    <>실측되지 않은 가정값입니다.</>
                  )}
                </Assumption>
                {data.sigma_ci && (
                  <Assumption k="변동성 구간">
                    95% {data.sigma_ci[0].toFixed(2)}~{data.sigma_ci[1].toFixed(2)}.{" "}
                    {data.sigma_ci_scope === "own_history" ? (
                      <>입력 이력의 부트스트랩 구간입니다.</>
                    ) : (
                      <>
                        <b className="text-paper-ink">시장 공통 변동의 표본오차만</b>{" "}
                        반영합니다 — 농가 고유 변동은 가정값이라 애초에 구간이 없습니다.
                        관측 {data.factors?.n ?? "12"}개년으로 σ 를 재면 상대 표준오차가
                        약 {Math.round(100 / Math.sqrt(2 * ((data.factors?.n ?? 12) - 1)))}
                        % 입니다.
                      </>
                    )}
                  </Assumption>
                )}
                <Assumption k="근거">{data.sigma_reference}</Assumption>
                <Assumption k="재해">
                  연간 발생확률 {pct(data.assumptions.p_disaster)}, 피해율 30~80% 균등
                  가정. 지역·작목별 실측값이 아닙니다.
                </Assumption>
                <Assumption k="시뮬레이션">
                  {data.assumptions.n_sim.toLocaleString("ko-KR")}회 반복, seed{" "}
                  {data.assumptions.seed}. 같은 입력이면 항상 같은 결과가 나옵니다.
                </Assumption>
                <Assumption k="제도 조건">{data.product.source}</Assumption>
              </dl>
              <a
                href="/methodology.html"
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block border-b border-paper-accent/40 text-xs font-medium text-paper-accent transition hover:border-paper-accent"
              >
                데이터가 어떤 분석을 거쳐 이 숫자가 됐는지 — 전체 계보 보기 →
              </a>
            </div>
          </div>
        </ReportSection>

        {/* ── 07 제도 근거 ────────────────────────────── */}
        <ReportSection
          n={next()}
          title="제도 요건 확인"
          lead="근거 조항을 찾지 못하면 답변을 만들어내지 않습니다."
        >
          <RegulationAsk
            context={{ crop_id: data.input.crop_id, product_id: data.product.id }}
          />
        </ReportSection>

        {/* ── 08 면책 ─────────────────────────────────── */}
        <ReportSection n={next()} title="면책">
          <p className="text-xs leading-relaxed text-paper-ink3">
            {data.disclaimer} 이 리포트는 공개 통계와 제도 파라미터로 계산한 참고자료이며,
            개별 농가의 실제 소득·비용 구조와 다를 수 있습니다. 실제 대출 가능 여부와
            조건은 사업 시행기관과 취급 금융기관의 심사로 결정됩니다.
          </p>
        </ReportSection>
        </div>
      </article>

      <div className="no-print mx-auto mt-5 flex max-w-[46rem] flex-wrap gap-2">
        <a
          href="/diagnose"
          className="inline-flex min-h-11 items-center border border-gov-line bg-white px-4 text-[13px] font-semibold text-gov-ink2 transition hover:border-gov-link hover:text-gov-head"
        >
          조건 바꿔 다시 계산
        </a>
        <a
          href="/"
          className="inline-flex min-h-11 items-center border border-gov-line bg-white px-4 text-[13px] font-semibold text-gov-ink2 transition hover:border-gov-link hover:text-gov-head"
        >
          대시보드로
        </a>
        <ShareButton />
        <PrintButton />
      </div>
    </main>
  );
}

function Assumption({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] gap-3 border-b border-gov-line2 pb-2 last:border-0">
      <dt className="text-paper-ink3">{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ShareButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(window.location.href).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="inline-flex min-h-11 items-center border border-gov-line bg-white px-4 text-[13px] font-semibold text-gov-ink2 transition hover:border-gov-link hover:text-gov-head"
    >
      {copied ? "링크를 복사했습니다" : "리포트 링크 복사"}
    </button>
  );
}

function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex min-h-11 items-center border border-gov-line bg-white px-4 text-[13px] font-semibold text-gov-ink2 transition hover:border-gov-link hover:text-gov-head"
    >
      인쇄 · PDF 저장
    </button>
  );
}
