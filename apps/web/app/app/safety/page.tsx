"use client";

import { useEffect, useState } from "react";
import { Btn, Empty, Notice, PageTitle, Panel, Section, Stat } from "@/components/gov";
import StressTable from "@/components/gov/StressTable";
import { fetchStress, runDiagnose, type Diagnosis, type StressReport } from "@/lib/api";
import { headlineLimit } from "@/lib/diagnosis";
import { useFarm } from "@/lib/useFarm";
import { won } from "@/lib/format";

export default function SafetyPage() {
  const { profile, ready } = useFarm();
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [report, setReport] = useState<StressReport | null>(null);
  const [principal, setPrincipal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    runDiagnose({
      crop_id: profile.cropId, pyeong: profile.pyeong, living_cost: profile.livingCost,
      other_debt_service: profile.otherDebtService, product_id: profile.productId,
      income_history: profile.incomeHistory,
    })
      .then((d) => { setDiag(d); setPrincipal((p) => p ?? headlineLimit(d)); })
      .catch(() => setError("계산에 실패했습니다."));
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
        <PageTitle title="금융 안전진단" lead="농가 정보가 있어야 계산합니다." />
        <Empty title="농가 정보가 없습니다" body="작목과 면적을 먼저 입력해 주세요."
               cta={{ href: "/app/farm", label: "내 농가 정보 입력" }} />
      </>
    );
  }

  const failed = report?.scenarios.filter((s) => !s.survives && s.key !== "base") ?? [];

  return (
    <>
      <PageTitle
        title="금융 안전진단"
        lead="평균적으로 얼마나 위험한가가 아니라, 특정한 나쁜 일이 실제로 일어나면 버티는지를 봅니다."
      />

      {error && <div className="mb-5"><Notice tone="danger">{error}</Notice></div>}

      {diag && (
        <Section title="평가 조건">
          <Panel>
            <div className="flex flex-wrap items-end gap-6">
              <div>
                <label htmlFor="principal" className="mb-1.5 block text-[13px] font-semibold text-gov-ink2">
                  차입 원금
                </label>
                <div className="flex items-center gap-2">
                  <input id="principal" inputMode="numeric"
                         value={principal != null ? Math.round(principal / 10_000) : ""}
                         onChange={(e) => setPrincipal(Number(e.target.value.replace(/[^\d]/g, "")) * 10_000)}
                         className="tabular w-32 border border-gov-line px-3 py-2 text-right text-[14px] outline-none focus:border-gov-link" />
                  <span className="text-[13px] text-gov-ink3">만원</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  ["권장", headlineLimit(diag)],
                  ["DSCR 기준", diag.limits.recommended],
                  ["제도 한도", diag.limits.available],
                ].map(([l, v]) => (
                  <button key={l as string} onClick={() => setPrincipal(v as number)}
                          className="border border-gov-line px-3 py-2 text-[12px] text-gov-ink2 hover:border-gov-link hover:text-gov-head">
                    {l as string} {won(v as number)}
                  </button>
                ))}
              </div>
              {report && (
                <div className="ml-auto flex gap-6">
                  <Stat label="영업레버리지" value={`${report.leverage.toFixed(2)}배`}
                        note="총수입 ÷ 소득" />
                  <Stat label="소득 변동성 σ" value={report.sigma.toFixed(3)} />
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
              <Notice tone="danger" title={`${failed.length}개 시나리오에서 상환이 어렵습니다`}>
                {failed.map((f) => f.label).join(", ")} 상황에서 2년 연속 위기 확률이 감내
                기준을 넘습니다. 차입 규모를 줄이거나, 아래 대응을 미리 준비해 두시기 바랍니다.
              </Notice>
            </div>
          )}

          <Section title={busy ? "다시 계산 중…" : "시나리오별 상환가능성"}>
            <StressTable scenarios={report.scenarios} tolerance={report.tolerance} />
          </Section>

          <Section title="왜 이렇게 크게 흔들리나">
            <Panel>
              <p className="text-[14px] leading-relaxed text-gov-ink2">
                이 농가의 영업레버리지는 <b className="text-gov-ink">{report.leverage.toFixed(2)}배</b>입니다.
                경영비는 매출이 줄어도 그대로 나가기 때문에, 가격이 20% 떨어지면 소득은 20%가
                아니라 <b className="text-gov-point">
                  {Math.abs((report.scenarios.find((s) => s.key === "price")?.income_change ?? 0) * 100).toFixed(0)}%
                </b> 줄어듭니다.
              </p>
              <p className="mt-2.5 text-[13px] leading-relaxed text-gov-ink3">
                계산에서 경영비는 줄어들지 않는 것으로 둡니다. 실제로는 수확 관련 비용이 일부
                줄지만 그 비율에 대한 공개 근거가 없어 지어내지 않았습니다. 그만큼 이 결과는
                보수적입니다.
              </p>
            </Panel>
          </Section>

          <Section title="대응">
            <ol className="border-t border-gov-ink/70">
              {[
                ["차입 규모를 줄인다", `현재 평가 중인 ${won(report.principal)} 대신 감당 가능한 범위로 낮추면 모든 시나리오의 위험이 함께 내려갑니다.`],
                ["출하 시기를 나눈다", "한 시점의 시세에 한 해 소득이 걸리지 않게 합니다. 계약재배나 수매 약정으로 판매가를 미리 묶는 방법도 있습니다."],
                ["재해 대응을 미리 확인한다", "피해율 30% 이상이면 상환기한 연기가 가능합니다. 요건과 신청 경로를 미리 알아 두는 것과 사후에 알아보는 것은 다릅니다."],
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
            <Btn href="/app/finance">적정 차입 규모 보기</Btn>
            <Btn href="/app/relief" variant="ghost">구제제도 확인</Btn>
          </div>
        </>
      )}
    </>
  );
}
