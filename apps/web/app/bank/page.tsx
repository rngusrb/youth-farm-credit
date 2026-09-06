"use client";

import { SourceLegend } from "@/components/SourceTag";
import { sigmaSourceKind, sigmaSourceNote } from "@/lib/diagnosis";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Btn, Notice, PageTitle, Panel, Section, Stat } from "@/components/gov";
import { fetchCrop, runDiagnose, type CropDetail, type Diagnosis } from "@/lib/api";
import { headlineLimit, headlineScenario, unsafeGap } from "@/lib/diagnosis";
import { APPLICANTS, type Applicant } from "@/lib/applicants";
import { pct, pyeong as fmtPyeong, ratio, won } from "@/lib/format";

export default function BankHome() {
  // 심사역에게 '내 농가 정보' 를 요구하는 건 말이 안 된다. 접수된 건에서 고른다.
  const [applicant, setApplicant] = useState<Applicant>(APPLICANTS[0]);
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [crop, setCrop] = useState<CropDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setDiag(null);
    runDiagnose({
      crop_id: applicant.cropId, pyeong: applicant.pyeong, living_cost: applicant.livingCost,
      other_debt_service: applicant.otherDebtService, product_id: applicant.productId,
      income_history: applicant.incomeHistory,
    })
      .then((d) => {
        if (!alive) return;
        setDiag(d);
        return fetchCrop(applicant.cropId).then((c) => alive && setCrop(c));
      })
      .catch(() => alive && setError("계산에 실패했습니다."));
    return () => { alive = false; };
  }, [applicant]);

  const s = diag ? headlineScenario(diag) : undefined;
  const gap = diag ? unsafeGap(diag) : 0;

  const flags = diag && s ? [
    {
      on: applicant.requested > headlineLimit(diag),
      level: "주의",
      text: `신청액 ${won(applicant.requested)} 이 감당 가능 금액 ${won(headlineLimit(diag))} 을 ${won(applicant.requested - headlineLimit(diag))} 초과합니다.`,
    },
    {
      on: gap > 0,
      level: "주의",
      text: `신청 가능 한도와 감당 가능 금액의 차이 ${won(gap)}. 한도까지 실행하면 2년연속 위기확률이 위험 기준을 넘습니다.`,
    },
    {
      on: diag.limits.binding_constraint === "livelihood",
      level: "경고",
      text: "대출 규모가 아니라 경영 규모가 제약입니다. 무차입 상태에서도 생활비 충당이 어렵습니다.",
    },
    {
      on: s.first_risk_year != null && s.first_risk_year <= diag.product.grace_years + 3,
      level: "주의",
      text: `원금도 갚기 시작 직후 ${s.first_risk_year}년차에 연간 부족확률이 20%를 넘습니다. 사후관리 시점을 앞당길 필요가 있습니다.`,
    },
    {
      on: !diag.sigma_personalized,
      level: "정보",
      text: "차주 소득 이력이 없어 작목 평균 변동성으로 계산했습니다. 실적 자료를 받으면 추정이 개인화됩니다.",
    },
    {
      on: (crop?.leverage ?? 0) >= 2,
      level: "주의",
      text: `영업레버리지 ${crop?.leverage?.toFixed(2)}배. 들어온 돈이 조금만 빠져도 소득이 크게 훼손됩니다.`,
    },
  ].filter((f) => f.on) : [];

  return (
    <>
      <PageTitle
        title="심사 대시보드"
        lead="신청자의 농장 정보로 대출 계획을 살펴봐요. 빌려줄 금액에 따라 갚을 돈이 부족할 위험을 확인해요."
        aside={diag ? <Btn href={`/result/${diag.diagnosis_id}`} variant="ghost">심사 리포트</Btn> : undefined}
      />

      {error && <div className="mb-5"><Notice tone="danger">{error}</Notice></div>}

      <Section title="심사 대상" action={
        <Link href="/bank/applicants" className="inline-flex min-h-11 items-center text-[12px] text-gov-ink3 hover:text-gov-link">
          전체 {APPLICANTS.length}건 +
        </Link>
      }>
        <div className="flex flex-wrap gap-2">
          {APPLICANTS.map((a) => {
            const on = a.ref === applicant.ref;
            return (
              <button key={a.ref} onClick={() => setApplicant(a)} aria-pressed={on}
                      className={`flex min-h-11 flex-col justify-center rounded-md border px-3 py-2 text-left transition ${
                        on ? "border-gov-head bg-gov-soft" : "border-gov-line hover:border-gov-link"}`}>
                <span className={`text-[13px] font-bold ${on ? "text-gov-head" : "text-gov-ink"}`}>
                  {a.name}
                </span>
                <span className="tabular text-[12px] text-gov-ink3">{a.ref} · {won(a.requested)} 신청</span>
              </button>
            );
          })}
        </div>
      </Section>

      {diag && s && (
        <>
          <Section title="신청자 정보">
            <Panel>
              <SourceLegend className="mb-5" />
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                <Stat label="차주" value={applicant.name} src="input"
                      note={`${applicant.ref} · ${applicant.region} · ${diag.input.crop_name} ${fmtPyeong(diag.input.pyeong)}`} />
                <Stat label="한 해 농사로 번 돈" value={won(diag.income.annual)}
                      src="public"
                      srcNote="공표 10a당 소득에 차주가 신고한 면적을 비례 적용했습니다. 규모의 경제는 반영하지 않았습니다."
                      note={`갚는 데 쓸 돈 ${won(diag.income.capacity)}`} />
                <Stat label="소득이 흔들리는 정도 σ" value={diag.sigma.toFixed(3)}
                      src={sigmaSourceKind(diag)} srcNote={sigmaSourceNote(diag)}
                      note={diag.sigma_personalized ? "차주 실적 반영" : "작목 평균 (실적 미제출)"} />
                <Stat label="영업레버리지" value={crop?.leverage ? `${crop.leverage.toFixed(2)}배` : "—"}
                      tone={(crop?.leverage ?? 0) >= 2 ? "warn" : "plain"}
                      src="public" srcNote="들어온 돈·농사 비용 모두 공표 소득조사 값입니다."
                      note="들어온 돈 ÷ 소득" />
              </div>
            </Panel>
          </Section>

          <Section title="위험 신호">
            {flags.length === 0 ? (
              <Notice tone="info">특이 신호가 없습니다.</Notice>
            ) : (
              <ul className="border-t border-gov-ink/70">
                {flags.map((f, i) => (
                  <li key={i} className="flex items-start gap-3 border-b border-gov-line2 px-1 py-3">
                    <Badge tone={f.level === "경고" ? "danger" : f.level === "주의" ? "warn" : "plain"}>
                      {f.level}
                    </Badge>
                    <span className="text-[13px] leading-relaxed text-gov-ink2">{f.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="대출 검토 요약">
            <div className="table-scroll overflow-x-auto" tabIndex={0} role="region" aria-label="표 또는 차트 상세 · 좌우로 스크롤">
              <table className="w-full min-w-[620px] border-t border-gov-ink/70 text-[14px]">
                <thead>
                  <tr className="bg-gov-sunk text-right text-[12px] font-semibold text-gov-ink2">
                    <th scope="col" className="border-b border-gov-line px-4 py-3 text-left">기준</th>
                    <th scope="col" className="border-b border-gov-line px-4 py-3">금액</th>
                    <th scope="col" className="border-b border-gov-line px-4 py-3">DSCR</th>
                    <th scope="col" className="border-b border-gov-line px-4 py-3">2년연속 위기</th>
                    <th scope="col" className="border-b border-gov-line px-4 py-3 text-center">판단</th>
                  </tr>
                </thead>
                <tbody className="tabular text-right">
                  {([
                    ["제도상 신청 가능", diag.limits.available, diag.scenarios.at_available],
                    ["DSCR 기준", diag.limits.recommended, diag.scenarios.at_recommended],
                    ["위험기반 권장", headlineLimit(diag), diag.scenarios.at_risk_based],
                  ] as const).map(([label, amount, sc]) => {
                    const ok = (sc?.crisis_prob ?? 1) <= diag.limits.max_crisis_prob;
                    return (
                      <tr key={label} className="border-b border-gov-line2">
                        <th scope="row" className="px-4 py-3 text-left font-medium text-gov-ink">{label}</th>
                        <td className="px-4 py-3 text-gov-ink2">{won(amount)}</td>
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
            <p className="mt-3 text-[12px] leading-relaxed text-gov-ink3">
              DSCR 기준은 소득이 흔들리지 않는다는 가정에서 나온 값입니다. 같은 금액이라도
              변동성을 넣으면 위기확률이 크게 달라집니다 — 이 표의 두 번째 행과 세 번째 행의
              차이가 그 크기입니다.
            </p>
          </Section>

          <Section title="다음 단계">
            <div className="grid gap-px bg-gov-line sm:grid-cols-3">
              {[
                ["대출 갚을 능력 살펴보기", "/bank/capacity", "계절성과 변동성을 반영한 갚는 데 쓸 돈"],
                ["대출 금액 계획", "/bank/design", "실행 금액별 위험 곡선"],
                ["Stress Test", "/bank/stress", "가격·생산량·금리·재해 시나리오"],
              ].map(([t, href, d]) => (
                <Link key={href} href={href} className="group bg-white p-5 transition-colors hover:bg-gov-sunk">
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
