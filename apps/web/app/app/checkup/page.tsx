"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import IncomeSource from "@/components/IncomeSource";
import { Btn, Empty, Notice, PageTitle, Panel, Section, Stat } from "@/components/gov";
import {
  fetchBenchmark,
  runDiagnose,
  type Benchmark,
  type Diagnosis,
} from "@/lib/api";
import { pct, won } from "@/lib/format";
import { useFarm } from "@/lib/useFarm";

/** 2단계 — AI 농가 건강검진.
 *
 * 세 가지를 한 장에 놓는다: **내 소득이 어디서 왔나 · 평균과 견주면 어디쯤인가 ·
 * 이 작목 자체는 어떤 성질인가.**
 *
 * ## 지키는 것
 *
 * · 실적이 3개년 미만이면 **비교를 만들지 않는다**. 추정치를 평균과 견주면 언제나
 *   100%가 나온다 — 자기 자신과 비교하는 셈이라 뜻이 없다.
 * · "유사 농가"라고 부르지 않는다. 우리가 가진 건 개별 농가가 아니라 **작목별 평균**이다.
 * · 실적이 없어도 **작목 특성**은 유효하다. 그건 항상 보여준다.
 *
 * 2026-09-02 이전에는 이 내용이 "맞춤 처방" 화면 안에 있었다. 진단을 받으려면
 * 처방 화면에 들어가야 했다.
 */
export default function CheckupPage() {
  const { profile, ready } = useFarm();
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [b, setB] = useState<Benchmark | null>(null);
  const [plan, setPlan] = useState<Diagnosis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    runDiagnose({
      crop_id: profile.cropId,
      pyeong: profile.pyeong,
      living_cost: profile.livingCost,
      other_debt_service: profile.otherDebtService,
      product_id: profile.productId,
      income_history: profile.incomeHistory,
    })
      .then(setDiag)
      .catch(() => setError("진단에 실패했어요."));

    fetchBenchmark({
      crop_id: profile.cropId,
      pyeong: profile.pyeong,
      actual_income: profile.incomeHistory,
    })
      .then(setB)
      .catch(() => setError("평균 비교에 실패했어요."));

    // 계획 면적이 지금과 다르면 그 면적으로도 한 번 더 돌린다.
    // 계획을 몰래 갈아끼우지 않고 **나란히 놓고 견준다** — 화면에 뜬 숫자가
    // 지금 것인지 계획 것인지 헷갈리면 안 된다.
    if (profile.plannedPyeong && profile.plannedPyeong !== profile.pyeong) {
      runDiagnose({
        crop_id: profile.cropId,
        pyeong: profile.plannedPyeong,
        living_cost: profile.livingCost,
        other_debt_service: profile.otherDebtService,
        product_id: profile.productId,
        income_history: profile.incomeHistory,
        // 실적은 **지금 면적**에서 낸 것이다. 안 보내면 계획 면적에서 낸 것으로
        // 잡혀 "1,800평으로 늘리면"이 지금과 똑같은 값을 낸다 (2026-09-02).
        income_history_pyeong: profile.pyeong,
      })
        .then(setPlan)
        .catch(() => undefined); // 계획 비교는 보조다
    } else {
      setPlan(null);
    }
  }, [profile]);

  if (!ready) return null;
  if (!profile) {
    return (
      <>
        <PageTitle title="AI 농가 건강검진" lead="농가 정보가 있어야 검진할 수 있어요." />
        <Empty
          title="농가 정보가 없어요"
          body="작목·면적·생활비를 먼저 입력해 주세요."
          cta={{ href: "/app/farm", label: "내 농장 정보 입력" }}
        />
      </>
    );
  }

  const t = b?.crop_traits;

  return (
    <>
      <PageTitle
        title="AI 농가 건강검진"
        lead="내 소득이 어디서 온 숫자인지, 같은 작목 전국 평균과 견주면 어디쯤인지, 이 작목 자체는 어떤 성질인지 봅니다."
      />

      {error && <div className="mb-5"><Notice tone="danger">{error}</Notice></div>}

      {diag && (
        <Section title="이 진단이 쓰는 내 소득">
          <IncomeSource d={diag} />
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Stat label="연 농업소득" value={won(diag.income.annual)} />
            <Stat
              label="상환에 쓸 수 있는 돈"
              value={won(diag.income.capacity)}
              tone={diag.income.capacity > 0 ? "ok" : "danger"}
              note="생활비·기존부채를 뺀 뒤"
            />
            <Stat
              label="평년 소득이 흔들리는 범위"
              value={`${won(diag.income.band_p10_p90[0])}~${won(diag.income.band_p10_p90[1])}`}
              note="하위 10% ~ 상위 10%"
            />
          </div>
        </Section>
      )}

      <Section title="전국 같은 작목 평균과 견주면">
        {b?.comparable ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat
                label="내 실적 평균"
                value={won(b.my_income ?? 0)}
                note={`최근 ${b.years}개년`}
              />
              <Stat label={`전국 ${b.crop_name} 평균`} value={won(b.average_income ?? 0)}
                    note="같은 면적으로 환산" />
              <Stat
                label="평균 대비"
                value={pct(b.ratio ?? 0)}
                tone={(b.ratio ?? 1) >= 1 ? "ok" : "warn"}
              />
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-gov-ink3">
              {b.note} 출처: {b.source}
            </p>
          </>
        ) : (
          <Notice tone="info" title="실적을 넣으면 견줘 드려요">
            {b?.message}{" "}
            <Link href="/app/farm" className="text-gov-link underline">
              내 농장 정보 입력
            </Link>
            에서 연도별 농업소득을 넣을 수 있어요.
          </Notice>
        )}
      </Section>

      {t && (
        <Section title="이 작목은 어떤 작목인가">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label="경영비 비율"
              value={t.cost_ratio === null ? "—" : pct(t.cost_ratio)}
              note="총수입 중 경영비"
            />
            <Stat
              label="소득 변동성"
              value={t.sigma.toFixed(3)}
              note={`${t.sigma_total}개 작목 중 ${t.sigma_rank}번째로 안정`}
            />
            <Stat label="변동의 주범" value={t.driver_label ?? "—"} note="요인분해 기준" />
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-gov-ink3">
            실적을 안 넣으셔도 이 세 가지는 작목 자체의 성질이라 그대로 유효해요.
          </p>
        </Section>
      )}

      {plan && diag && profile.plannedPyeong && (
        <Section title={`올해 계획대로 ${profile.plannedPyeong.toLocaleString()}평을 하면`}>
          <Panel>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat
                label="연 농업소득"
                value={won(plan.income.annual)}
                note={`지금 ${won(diag.income.annual)}`}
                tone={plan.income.annual >= diag.income.annual ? "ok" : "warn"}
              />
              <Stat
                label="상환에 쓸 수 있는 돈"
                value={won(plan.income.capacity)}
                note={`지금 ${won(diag.income.capacity)}`}
                tone={plan.income.capacity >= diag.income.capacity ? "ok" : "warn"}
              />
              <Stat
                label="상환위험 기준 차입"
                value={won(plan.limits.risk_based)}
                note={`지금 ${won(diag.limits.risk_based)}`}
                tone={plan.limits.risk_based >= diag.limits.risk_based ? "ok" : "warn"}
              />
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-gov-ink3">
              면적만 바꿔 다시 계산한 값이에요. <b>시설 증설비와 늘어나는 경영비는 넣지
              않았습니다</b> — 공개 통계에 그 금액의 근거가 없어서 지어내지 않았어요.
              {plan.income.source === "ACTUAL" &&
                ` 실적 ${won(diag.income.annual)}은 지금 ${profile.pyeong.toLocaleString()}평에서 낸 값이라, 계획 면적으로는 면적에 비례해 환산했어요.`}
            </p>
          </Panel>
        </Section>
      )}

      <Section title="다음으로">
        <div className="flex flex-wrap gap-2">
          <Btn href="/app/map">자금지도 보기</Btn>
          <Btn href="/app/safety" variant="ghost">값이 떨어지면 어떻게 되나</Btn>
          <Btn href="/app/prescribe" variant="ghost">맞춤 처방 받기</Btn>
        </div>
      </Section>
    </>
  );
}
