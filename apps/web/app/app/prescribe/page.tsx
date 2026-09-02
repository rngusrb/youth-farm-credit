"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge, Btn, Empty, Notice, PageTitle, Panel, Section, Stat } from "@/components/gov";
import { fetchSwitch, prescribe, type Prescription, type SwitchResult } from "@/lib/api";
import { pct, won } from "@/lib/format";
import { useFarm } from "@/lib/useFarm";

/** AI 맞춤 처방 — 평균 대비 위치 + 조건 조정안 + 신청서 초안.
 *
 * 세 가지를 지킨다.
 *  · 실적이 없으면 **평균 비교를 만들지 않는다** (추정치끼리 비교하면 늘 100%가 나온다)
 *  · 초안의 수치는 전부 엔진 값이고, 어긋난 문장은 빼고 그 개수를 밝힌다
 *  · 초안은 제출 서류가 아니라는 문구를 항상 붙인다
 */
export default function PrescribePage() {
  const { profile, ready } = useFarm();
  const [target, setTarget] = useState("");
  const [data, setData] = useState<Prescription | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sw, setSw] = useState<SwitchResult | null>(null);

  async function run(targetPrincipal?: number) {
    if (!profile) return;
    setLoading(true);
    setError(null);
    try {
      setData(
        await prescribe({
          crop_id: profile.cropId,
          pyeong: profile.pyeong,
          living_cost: profile.livingCost,
          other_debt_service: profile.otherDebtService,
          actual_income: profile.incomeHistory,
          ...(targetPrincipal ? { target_principal: targetPrincipal } : {}),
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "처방을 만들지 못했습니다");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!profile) return;
    void run();
    // 작목 전환은 보조 제안이다. 실패해도 본문은 보여준다.
    fetchSwitch({ crop_id: profile.cropId, pyeong: profile.pyeong })
      .then(setSw)
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  if (!ready) return null;
  if (!profile) {
    return (
      <>
        <PageTitle title="AI 맞춤 처방" lead="지금 상태를 보고 무엇을 하면 좋을지 정리해 드립니다." />
        <Empty
          title="농가 정보를 먼저 넣어 주세요"
          body="작목·면적·생활비가 있어야 계산할 수 있어요."
          cta={{ href: "/app/farm", label: "내 농가 정보" }}
        />
      </>
    );
  }

  const b = data?.benchmark;
  const t = b?.crop_traits;

  return (
    <>
      <PageTitle
        title="AI 맞춤 처방"
        lead="전국 평균과 견주고, 원하는 금액을 감당할 조건을 찾고, 신청서 초안까지 만들어 드립니다."
      />

      {error && <Notice tone="warn" title="처방을 만들지 못했어요">{error}</Notice>}
      {loading && !data && (
        <Panel><p className="text-[14px] text-gov-ink2">계산하고 있어요. 몇 초 걸립니다.</p></Panel>
      )}

      {data && (
        <>
          <Section title="전국 평균 대비">
            {b?.comparable ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Stat label="내 평균 소득" value={won(b.my_income ?? 0)} note={`최근 ${b.years}개년`} />
                  <Stat label={`전국 ${b.crop_name} 평균`} value={won(b.average_income ?? 0)} />
                  <Stat
                    label="평균 대비"
                    value={pct(b.ratio ?? 0)}
                    tone={(b.ratio ?? 1) >= 1 ? "ok" : "warn"}
                  />
                </div>
                <p className="mt-2 text-[12px] text-gov-ink3">{b.note} 출처: {b.source}</p>
              </>
            ) : (
              <Notice tone="info" title="실적을 넣으면 견줘 드려요">
                {b?.message}{" "}
                <Link href="/app/farm" className="text-gov-link underline">내 농가 정보</Link>
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
              <p className="mt-2 text-[12px] text-gov-ink3">
                실적을 안 넣으셔도 이 세 가지는 작목 자체의 성질이라 그대로 유효해요.
              </p>
            </Section>
          )}

          <Section title="원하는 금액이 있으면">
            <Panel>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = Number(target.replace(/[^\d]/g, ""));
                  if (v) void run(v);
                }}
                className="flex flex-wrap items-end gap-3"
              >
                <label className="flex-1 min-w-[220px]">
                  <span className="mb-1 block text-[13px] font-medium text-gov-ink2">차입 희망 금액 (원)</span>
                  <input
                    inputMode="numeric"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    placeholder="300000000"
                    className="w-full rounded-lg border border-gov-line px-3 py-2 text-[15px]"
                  />
                </label>
                <Btn type="submit" disabled={loading}>{loading ? "계산 중…" : "조정안 보기"}</Btn>
              </form>

              {data.levers && (
                <ul className="mt-3 space-y-1.5">
                  {data.levers.levers.map((l) => (
                    <li key={l.variable} className="text-[13px]">
                      {l.reachable ? (
                        <span className="text-gov-head">
                          · {l.note}{" "}
                          <span className="text-gov-ink2">
                            ({pct(l.crisis_prob_before)} → {pct(l.crisis_prob_after ?? 0)})
                          </span>
                        </span>
                      ) : (
                        <span className="text-gov-ink3">· {l.label}: {l.note}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </Section>

          {sw && (sw.replace.length > 0 || sw.diversify.length > 0) && (
            <Section title="작목을 바꾸거나 섞으면">
              <Panel>
                {sw.diversify.length > 0 && (
                  <>
                    <p className="text-[13px] font-semibold text-gov-head">절반씩 섞으면 더 안정적인 조합</p>
                    <ul className="mt-1 space-y-1">
                      {sw.diversify.slice(0, 3).map((c) => (
                        <li key={c.crop_id} className="text-[13px] text-gov-ink">
                          · {sw.current.crop_name} + {c.crop_name} — 변동성{" "}
                          {sw.current.sigma.toFixed(3)} → <b>{c.blended_sigma?.toFixed(3)}</b>
                          <span className="text-gov-ink2"> (출하월 겹침 {pct(c.overlap_ratio)})</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {sw.replace.length > 0 && (
                  <>
                    <p className="mt-3 text-[13px] font-semibold text-gov-head">같은 면적으로 바꾼다면</p>
                    <ul className="mt-1 space-y-1">
                      {sw.replace.slice(0, 3).map((c) => (
                        <li key={c.crop_id} className="text-[13px] text-gov-ink">
                          · {c.crop_name} — 소득 {pct(c.income_ratio)} 수준, 변동성{" "}
                          {c.sigma.toFixed(3)} ({c.sigma_delta >= 0 ? "+" : ""}
                          {c.sigma_delta.toFixed(3)})
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <Notice tone="warn" title="전환 비용은 반영하지 않았습니다">{sw.note}</Notice>
              </Panel>
            </Section>
          )}

          <Section title="신청서 초안">
            <Panel>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone={data.draft.method === "template" ? "plain" : "info"}>
                  {data.draft.method === "template" ? "규칙기반" : "AI 작성"}
                </Badge>
                <span className="text-[12px] text-gov-ink3">
                  수치 {data.draft.numbers_used.length}개를 엔진 값과 대조했어요
                </span>
              </div>

              <p className="whitespace-pre-line text-[14px] leading-7 text-gov-ink">{data.draft.body}</p>

              {data.draft.dropped.length > 0 && (
                <p className="mt-3 text-[12px] text-gov-warn">
                  숫자가 엔진 값과 맞지 않아 {data.draft.dropped.length}문장을 뺐어요.
                </p>
              )}

              {data.draft.citations.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-gov-line pt-3">
                  {data.draft.citations.map((c, i) => (
                    <details key={i}>
                      <summary className="cursor-pointer text-[12px] text-gov-link">
                        {c.doc} {c.section}
                      </summary>
                      <p className="mt-1 whitespace-pre-line text-[12px] leading-6 text-gov-ink2">{c.text}</p>
                    </details>
                  ))}
                </div>
              )}

              <Notice tone="warn" title="확인해 주세요">{data.draft.disclaimer}</Notice>
            </Panel>
          </Section>
        </>
      )}
    </>
  );
}
