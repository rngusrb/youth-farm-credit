"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Btn, Empty, Notice, PageTitle, Panel, Section, Stat } from "@/components/gov";
import { fetchCrop, runDiagnose, type CropDetail, type Diagnosis } from "@/lib/api";
import { headlineLimit, headlineScenario, unsafeGap } from "@/lib/diagnosis";
import { useFarm } from "@/lib/useFarm";
import { pct, pyeong as fmtPyeong, ratio, won } from "@/lib/format";

export default function BankHome() {
  const { profile, ready } = useFarm();
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [crop, setCrop] = useState<CropDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    runDiagnose({
      crop_id: profile.cropId, pyeong: profile.pyeong, living_cost: profile.livingCost,
      other_debt_service: profile.otherDebtService, product_id: profile.productId,
      income_history: profile.incomeHistory,
    })
      .then((d) => { setDiag(d); return fetchCrop(profile.cropId).then(setCrop); })
      .catch(() => setError("계산에 실패했습니다."));
  }, [profile]);

  if (!ready) return null;
  if (!profile) {
    return (
      <>
        <PageTitle title="심사 대시보드" lead="심사할 차주 정보가 필요합니다." />
        <Empty title="차주 정보가 없습니다"
               body="농가용 화면의 「내 농가 정보」에 입력한 값을 그대로 심사 관점으로 봅니다. 데모에서는 같은 정보를 공유합니다."
               cta={{ href: "/app/farm", label: "차주 정보 입력" }} />
      </>
    );
  }

  const s = diag ? headlineScenario(diag) : undefined;
  const gap = diag ? unsafeGap(diag) : 0;

  const flags = diag && s ? [
    {
      on: gap > 0,
      level: "주의",
      text: `신청 가능 한도와 감당 가능 금액의 차이 ${won(gap)}. 한도까지 실행하면 2년연속 위기확률이 감내 기준을 넘습니다.`,
    },
    {
      on: diag.limits.binding_constraint === "livelihood",
      level: "경고",
      text: "대출 규모가 아니라 경영 규모가 제약입니다. 무차입 상태에서도 생활비 충당이 어렵습니다.",
    },
    {
      on: s.first_risk_year != null && s.first_risk_year <= diag.product.grace_years + 3,
      level: "주의",
      text: `거치 종료 직후 ${s.first_risk_year}년차에 연간 부족확률이 20%를 넘습니다. 사후관리 시점을 앞당길 필요가 있습니다.`,
    },
    {
      on: !diag.sigma_personalized,
      level: "정보",
      text: "차주 소득 이력이 없어 작목 평균 변동성으로 계산했습니다. 실적 자료를 받으면 추정이 개인화됩니다.",
    },
    {
      on: (crop?.leverage ?? 0) >= 2,
      level: "주의",
      text: `영업레버리지 ${crop?.leverage?.toFixed(2)}배. 총수입이 조금만 빠져도 소득이 크게 훼손됩니다.`,
    },
  ].filter((f) => f.on) : [];

  return (
    <>
      <PageTitle
        title="심사 대시보드"
        lead="같은 분석을 여신 관점으로 봅니다. 농가 화면이 “얼마까지 안전한가”를 답한다면, 여기서는 “이 금액을 실행하면 무엇이 위험한가”를 봅니다."
        aside={diag ? <Btn href={`/result/${diag.diagnosis_id}`} variant="ghost">심사 리포트</Btn> : undefined}
      />

      {error && <div className="mb-5"><Notice tone="danger">{error}</Notice></div>}

      {diag && s && (
        <>
          <Section title="차주 개요">
            <Panel>
              <div className="grid gap-6 sm:grid-cols-4">
                <Stat label="작목 · 규모" value={diag.input.crop_name}
                      note={`${fmtPyeong(diag.input.pyeong)} · ${crop?.group ?? ""}`} />
                <Stat label="연 농업소득" value={won(diag.income.annual)}
                      note={`상환여력 ${won(diag.income.capacity)}`} />
                <Stat label="소득 변동성 σ" value={diag.sigma.toFixed(3)}
                      note={diag.sigma_personalized ? "차주 실적 반영" : "작목 평균 (실적 미제출)"} />
                <Stat label="영업레버리지" value={crop?.leverage ? `${crop.leverage.toFixed(2)}배` : "—"}
                      tone={(crop?.leverage ?? 0) >= 2 ? "warn" : "plain"}
                      note="총수입 ÷ 소득" />
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

          <Section title="여신 판단 요약">
            <div className="overflow-x-auto">
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
                ["상환능력 분석", "/bank/capacity", "계절성과 변동성을 반영한 상환여력"],
                ["적정 여신 설계", "/bank/design", "실행 금액별 위험 곡선"],
                ["Stress Test", "/bank/stress", "가격·생산량·금리·재해 시나리오"],
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
