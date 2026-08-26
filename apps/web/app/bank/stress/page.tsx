"use client";

import { useEffect, useState } from "react";
import { Btn, Empty, Notice, PageTitle, Panel, Section, Stat } from "@/components/gov";
import StressTable from "@/components/gov/StressTable";
import { fetchStress, runDiagnose, type Diagnosis, type StressReport } from "@/lib/api";
import { headlineLimit } from "@/lib/diagnosis";
import { useFarm } from "@/lib/useFarm";
import { pct, won } from "@/lib/format";

export default function BankStressPage() {
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
      .then((d) => { setDiag(d); setPrincipal((p) => p ?? d.limits.available); })
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
        <PageTitle title="여신 Stress Test" lead="차주 정보가 필요합니다." />
        <Empty title="차주 정보가 없습니다" body="농가 정보를 먼저 입력해 주세요."
               cta={{ href: "/app/farm", label: "차주 정보 입력" }} />
      </>
    );
  }

  const failed = report?.scenarios.filter((s) => !s.survives && s.key !== "base") ?? [];
  const baseOk = report?.scenarios.find((s) => s.key === "base")?.survives ?? false;

  return (
    <>
      <PageTitle
        title="여신 Stress Test"
        lead="실행 예정 금액에 악조건을 얹어 상환가능성을 다시 계산합니다. 통과하지 못하는 시나리오가 있으면 금액이나 상환방식을 조정할 근거가 됩니다."
      />

      {error && <div className="mb-5"><Notice tone="danger">{error}</Notice></div>}

      {diag && (
        <Section title="실행 예정 금액">
          <Panel>
            <div className="flex flex-wrap items-end gap-6">
              <div>
                <label htmlFor="principal" className="mb-1.5 block text-[13px] font-semibold text-gov-ink2">
                  금액
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
                {([
                  ["신청액 (제도 한도)", diag.limits.available],
                  ["DSCR 기준", diag.limits.recommended],
                  ["위험기반 권장", headlineLimit(diag)],
                ] as const).map(([l, v]) => (
                  <button key={l} onClick={() => setPrincipal(v)}
                          className="inline-flex min-h-11 items-center rounded-md border border-gov-line px-3 text-[12px] text-gov-ink2 hover:border-gov-link hover:text-gov-head">
                    {l}<span className="tabular ml-1.5 text-gov-ink3">{won(v)}</span>
                  </button>
                ))}
              </div>
            </div>
          </Panel>
        </Section>
      )}

      {report && (
        <>
          <div className="mb-5">
            {!baseOk ? (
              <Notice tone="danger" title="기준 시나리오부터 통과하지 못합니다">
                악조건을 얹기 전에도 {won(report.principal)} 실행 시 2년연속 위기확률이
                감내 기준 {pct(report.tolerance)}를 넘습니다. 금액 조정이 선행돼야 합니다.
              </Notice>
            ) : failed.length > 0 ? (
              <Notice tone="warn" title={`${failed.length}개 시나리오에서 상환여력 부족`}>
                {failed.map((f) => `${f.label}(위기확률 ${pct(f.crisis_prob)})`).join(", ")}.
                해당 조건 발생 시 상환이 어려워집니다.
              </Notice>
            ) : (
              <Notice tone="info" title="모든 시나리오를 통과합니다">
                다만 아래 ‘제도 의존’ 표시가 있는 시나리오는 재해 상환연기 덕분에 수치가
                좋아 보이는 경우이므로 별도로 보셔야 합니다.
              </Notice>
            )}
          </div>

          <Section title={busy ? "다시 계산 중…" : "시나리오별 상환가능성"}>
            <StressTable scenarios={report.scenarios} tolerance={report.tolerance} audience="bank" />
          </Section>

          <Section title="상환방식 제안">
            <div className="grid gap-px bg-gov-line sm:grid-cols-3">
              {[
                ["실행 금액 조정", failed.length > 0
                  ? `${won(headlineLimit(diag ?? ({} as Diagnosis)) || 0)} 수준으로 낮추면 기준 시나리오를 통과합니다.`
                  : "현재 금액에서 기준 시나리오를 통과합니다."],
                ["거치기간 단축 검토", "지침상 거치기간은 최대 5년 이내에서 선택 가능합니다. 3년을 고르면 절벽이 앞당겨지지만 총이자와 잔액 축소 속도가 달라집니다."],
                ["운전자금 한도 병행", "수확기 편중으로 연중 특정 시점에 현금이 마르는 차주는 정책자금만으로 설계하면 흑자 연체가 발생할 수 있습니다."],
              ].map(([t, d]) => (
                <div key={t} className="bg-white p-5">
                  <h3 className="text-[14px] font-bold text-gov-ink">{t}</h3>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-gov-ink2">{d}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section title="가정과 한계">
            <Panel>
              <ul className="space-y-2 text-[13px] leading-relaxed text-gov-ink2">
                {[
                  `영업레버리지 ${report.leverage.toFixed(2)}배 기준입니다. 총수입 대비 경영비 비율은 KOSIS 농산물소득조사 실측값을 씁니다.`,
                  "충격 시 경영비는 줄어들지 않는 것으로 둡니다. 실제로는 수확 관련 비용이 일부 줄지만 공개 근거가 없어 보수적으로 계산합니다.",
                  "농신보 보증료는 지침에 요율이 명시돼 있지 않아 반영하지 않았습니다. 그만큼 상환여력이 과대평가됩니다.",
                  `난수 시드를 고정해 같은 입력이면 같은 결과가 나옵니다. σ = ${report.sigma.toFixed(3)}.`,
                ].map((t) => (
                  <li key={t} className="flex gap-2.5">
                    <span className="mt-[6px] h-1 w-1 shrink-0 bg-gov-ink3" aria-hidden />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </Section>

          {diag && (
            <div className="flex gap-2">
              <Btn href={`/result/${diag.diagnosis_id}`}>심사 리포트 출력</Btn>
              <Btn href="/bank/design" variant="ghost">여신 설계로 돌아가기</Btn>
            </div>
          )}
        </>
      )}
    </>
  );
}
