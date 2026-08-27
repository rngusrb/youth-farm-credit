"use client";

import { useEffect, useState } from "react";
import { Badge, Btn, Empty, Notice, PageTitle, Panel, Section, Stat } from "@/components/gov";
import { askRegulation, fetchProducts, runDiagnose, type Diagnosis, type RegulationAnswer } from "@/lib/api";
import { headlineScenario } from "@/lib/diagnosis";
import { useFarm } from "@/lib/useFarm";
import { pct, won } from "@/lib/format";

/** 구제제도 조기 라우팅.
 *
 * 연체가 난 뒤에 알아보는 것과 미리 알아 두는 것은 다르다. 거치 후반기에
 * 위험이 예상되면 그 전에 꺼내 보여 준다.
 *
 * **여기 실린 제도 내용은 전부 코퍼스의 지침 원문에서 찾아온다.** 우리가 원문을
 * 갖고 있지 않은 제도는 지어내지 않고 '수록 안 됨' 으로 표시한다.
 */
const LOOKUPS = [
  { key: "재해 상환연기", q: "재해로 피해를 입으면 상환을 연기할 수 있나" },
  { key: "할부 유예", q: "상환기한 연기와 분할상환 조치" },
  { key: "자금 회수 사유", q: "육성자금 회수 사유는 무엇인가" },
];

const NOT_IN_CORPUS = [
  {
    name: "농업경영회생자금",
    why: "이 서비스의 자료실에 해당 지침 원문이 수록돼 있지 않아요. 내용을 지어내지 않고 링크로만 안내해요.",
    href: "https://www.nonghyup.com",
    hint: "취급 기관과 요건은 농협 또는 관할 시·군·구에 확인하세요.",
  },
  {
    name: "농작물재해보험",
    why: "보험료율과 보장 범위가 우리 자료에 없어 계산에 넣지 않았어요.",
    href: "https://www.nonghyup.com",
    hint: "가입 시기가 품목별로 정해져 있어 미리 확인이 필요해요.",
  },
];

export default function ReliefPage() {
  const { profile, ready } = useFarm();
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [relief, setRelief] = useState<{ damage_min: number; damage_max: number; defer_years: number }[]>([]);
  const [deferMax, setDeferMax] = useState<number | null>(null);
  const [source, setSource] = useState("");
  const [answers, setAnswers] = useState<Record<string, RegulationAnswer>>({});

  useEffect(() => {
    fetchProducts()
      .then((p) => {
        setRelief(p.disaster_relief);
        setDeferMax(p.installment_defer_max_count);
        setSource(p.relief_source);
      })
      .catch(() => undefined);
    LOOKUPS.forEach((l) => {
      askRegulation(l.q).then((r) => setAnswers((a) => ({ ...a, [l.key]: r }))).catch(() => undefined);
    });
  }, []);

  useEffect(() => {
    if (!profile) return;
    runDiagnose({
      crop_id: profile.cropId, pyeong: profile.pyeong, living_cost: profile.livingCost,
      other_debt_service: profile.otherDebtService, product_id: profile.productId,
      income_history: profile.incomeHistory,
    }).then(setDiag).catch(() => undefined);
  }, [profile]);

  if (!ready) return null;

  const s = diag ? headlineScenario(diag) : undefined;
  const grace = diag?.product.grace_years ?? 5;
  const atRisk = s?.first_risk_year != null;
  const nearCliff = s?.first_risk_year != null && s.first_risk_year <= grace + 3;

  return (
    <>
      <PageTitle
        title="구제제도"
        lead="연체가 난 뒤에 알아보는 것과 미리 알아 두는 것은 다릅니다. 거치가 끝나기 전에 어떤 제도를 쓸 수 있는지 확인해 두세요."
      />

      {!profile && (
        <div className="mb-6">
          <Empty title="농가 정보를 넣으면 내 상황에 맞춰 안내해요"
                 body="지금은 제도 일반 안내만 표시돼요."
                 cta={{ href: "/app/farm", label: "내 농가 정보 입력" }} />
        </div>
      )}

      {diag && s && (
        <Section title="내 상황">
          <Panel>
            <div className="grid gap-6 sm:grid-cols-3">
              <Stat label="최초 위험 연차"
                    value={s.first_risk_year ? `${s.first_risk_year}년차` : "없음"}
                    tone={nearCliff ? "danger" : atRisk ? "warn" : "ok"} />
              <Stat label="2년 연속 위기 확률" value={pct(s.crisis_prob)}
                    tone={s.crisis_prob > diag.limits.max_crisis_prob ? "danger" : "ok"} />
              <Stat label="거치 종료" value={`${grace + 1}년차`}
                    note={`상환액이 ${won(s.grace_payment)} → ${won(s.amort_payment)}`} />
            </div>
            <div className="mt-4">
              {nearCliff ? (
                <Notice tone="danger" title="거치 종료 직후가 고비예요">
                  {s.first_risk_year}년차에 상환 부족 확률이 20%를 넘어요. 그 전에 아래
                  제도의 요건과 신청 경로를 확인해 두시고, 상환이 밀리기 전에 취급 기관과
                  먼저 상담하시기 바라요. 연체가 시작된 뒤에는 선택지가 줄어들어요.
                </Notice>
              ) : atRisk ? (
                <Notice tone="warn" title={`${s.first_risk_year}년차를 주의하세요`}>
                  당장은 여유가 있지만 그 시점에 부족 확률이 높아집니다. 미리 알아 두시는
                  것만으로도 대응 폭이 넓어집니다.
                </Notice>
              ) : (
                <Notice tone="info" title="지금 조건에서는 위험 연차가 나타나지 않아요">
                  다만 재해나 가격 급락은 예고 없이 와요. 아래 제도는 미리 알아 두세요.
                </Notice>
              )}
            </div>
          </Panel>
        </Section>
      )}

      <Section title="지침에 근거가 있는 제도">
        {relief.length > 0 && (
          <Panel className="mb-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge tone="ok">지침 수록</Badge>
              <h3 className="text-[15px] font-bold text-gov-ink">재해 시 상환기한 연기</h3>
            </div>
            <ul className="space-y-1.5 text-[14px] text-gov-ink2">
              {relief.map((r) => (
                <li key={r.damage_min} className="flex gap-2">
                  <span className="text-gov-link" aria-hidden>·</span>
                  농가단위 피해율 {Math.round(r.damage_min * 100)}% 이상{" "}
                  {r.damage_max < 1 ? `${Math.round(r.damage_max * 100)}% 미만 ` : ""}
                  → <b className="text-gov-ink">{r.defer_years}년 연기</b>
                </li>
              ))}
              {deferMax && (
                <li className="flex gap-2">
                  <span className="text-gov-link" aria-hidden>·</span>
                  할부 유예는 최대 {deferMax}회까지
                </li>
              )}
            </ul>
            <p className="mt-3 text-[12px] leading-relaxed text-gov-ink3">{source}</p>
          </Panel>
        )}

        <div className="space-y-4">
          {LOOKUPS.map((l) => {
            const a = answers[l.key];
            if (!a || !a.citations.length) return null;
            const c = a.citations[0];
            return (
              <Panel key={l.key}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge tone="info">{c.section}</Badge>
                  <h3 className="text-[15px] font-bold text-gov-ink">{l.key}</h3>
                  <span className="text-[12px] text-gov-ink3">{c.doc}</span>
                </div>
                <blockquote className="whitespace-pre-wrap rounded-r-md border-l-4 border-gov-line bg-gov-sunk px-4 py-3 text-[12px] leading-relaxed text-gov-ink2">
                  {c.text.slice(0, 600)}{c.text.length > 600 ? "…" : ""}
                </blockquote>
              </Panel>
            );
          })}
        </div>
      </Section>

      <Section title="원문을 갖고 있지 않은 제도">
        <p className="mb-3 text-[13px] leading-relaxed text-gov-ink2">
          아래 제도는 실제로 존재하지만 이 서비스 자료실에 지침 원문이 수록돼 있지
          않아요. 내용을 추측해 적지 않고, 확인할 곳만 안내해요.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {NOT_IN_CORPUS.map((n) => (
            <Panel key={n.name}>
              <div className="mb-2 flex items-center gap-2">
                <Badge tone="warn">원문 미수록</Badge>
                <h3 className="text-[15px] font-bold text-gov-ink">{n.name}</h3>
              </div>
              <p className="text-[13px] leading-relaxed text-gov-ink2">{n.why}</p>
              <p className="mt-2 text-[12px] text-gov-ink3">{n.hint}</p>
            </Panel>
          ))}
        </div>
      </Section>

      <Notice tone="warn" title="반드시 확인하세요">
        여기 안내는 지침 원문을 찾아 주는 것이지 유권해석이 아닙니다. 실제 적용 여부와
        절차는 관할 시·군·구 담당자와 대출취급기관에 확인해야 해요.
      </Notice>

      <div className="mt-6 flex gap-2">
        <Btn href="/policy" variant="ghost">제도 근거 검색</Btn>
        <Btn href="/app/safety" variant="ghost">안전진단 다시 받기</Btn>
      </div>
    </>
  );
}
