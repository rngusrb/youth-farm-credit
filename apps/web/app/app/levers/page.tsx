"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge, Btn, Empty, Notice, PageTitle, Panel, Section, Stat } from "@/components/gov";
import { runDiagnose, solveFor, type Diagnosis, type Lever, type LeversResult } from "@/lib/api";
import { headlineLimit } from "@/lib/diagnosis";
import { pct, pyeong as fmtPyeong, won } from "@/lib/format";
import { useFarm } from "@/lib/useFarm";

/** 화면이 계산하지 않는다. 표시만 한다 — 값은 전부 엔진이 만든 것이다. */
function leverValue(l: Lever): string {
  if (l.to_value === null) return "—";
  return l.unit === "원" ? won(l.to_value) : fmtPyeong(l.to_value);
}

function leverFrom(l: Lever): string {
  return l.unit === "원" ? won(l.from_value) : fmtPyeong(l.from_value);
}

function rangeNote(l: Lever): string {
  const fmt = (v: number) => (l.unit === "원" ? won(v) : fmtPyeong(v));
  return `탐색 범위 ${fmt(l.searched_from)} ~ ${fmt(l.searched_to)}`;
}

export default function LeversPage() {
  const { profile, ready } = useFarm();
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState<LeversResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    runDiagnose({
      crop_id: profile.cropId,
      pyeong: profile.pyeong,
      living_cost: profile.livingCost,
      other_debt_service: profile.otherDebtService,
          income_history: profile.incomeHistory,
    })
      .then(setDiag)
      .catch(() => undefined);
  }, [profile]);

  const safe = diag ? headlineLimit(diag) : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    const target = Number(amount.replace(/[^\d]/g, ""));
    if (!target) {
      setError("금액을 숫자로 넣어 주세요");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(
        await solveFor({
          crop_id: profile.cropId,
          pyeong: profile.pyeong,
          living_cost: profile.livingCost,
          other_debt_service: profile.otherDebtService,
          actual_income: profile.incomeHistory,
          target_principal: target,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "계산하지 못했습니다");
    } finally {
      setLoading(false);
    }
  }

  if (!ready) return null;
  if (!profile) {
    return (
      <>
        <PageTitle title="얼마까지 받으려면" lead="원하는 금액을 감당하려면 무엇이 달라져야 하는지 계산합니다." />
        <Empty
          title="농가 정보를 먼저 넣어 주세요"
          body="작목·면적·생활비가 있어야 계산할 수 있어요."
          cta={{ href: "/app/farm", label: "내 농가 정보" }}
        />
      </>
    );
  }

  const reachable = result?.levers.filter((l) => l.reachable) ?? [];
  const blocked = result?.levers.filter((l) => !l.reachable) ?? [];
  const alreadyOk = result && result.base_crisis_prob !== null
    && result.base_crisis_prob <= result.max_crisis_prob;

  return (
    <>
      <PageTitle
        title="얼마까지 받으려면"
        lead="원하는 금액이 지금 조건에서 무리라면, 무엇을 얼마나 바꾸면 되는지 역으로 찾습니다."
      />

      <Section title="원하는 금액">
        <Panel>
          <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
            <label className="flex-1 min-w-[220px]">
              <span className="mb-1 block text-[13px] font-medium text-gov-ink2">차입 희망 금액 (원)</span>
              <input
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={safe ? String(Math.round(safe * 1.5)) : "300000000"}
                className="w-full min-h-11 rounded-lg border border-gov-line px-3 py-2 text-[15px]"
              />
            </label>
            <Btn type="submit" disabled={loading}>
              {loading ? "계산 중…" : "계산하기"}
            </Btn>
          </form>
          {safe !== null && (
            <p className="mt-3 text-[13px] text-gov-ink2">
              지금 조건의 권장 차입은 <b>{won(safe)}</b> 이에요. 그보다 큰 금액을 넣어 보세요.
            </p>
          )}
          {error && <Notice tone="warn" title="계산하지 못했어요">{error}</Notice>}
        </Panel>
      </Section>

      {loading && (
        <Section title="계산 중">
          <Panel>
            <p className="text-[14px] text-gov-ink2">
              25년을 3만 번 돌리면서 조건을 하나씩 바꿔 보고 있어요. 2~4초 걸립니다.
            </p>
          </Panel>
        </Section>
      )}

      {result && (
        <>
          <Section title="지금 상태">
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="원하는 금액" value={won(result.target_principal)} />
              <Stat
                label="이 금액의 2년연속 부족확률"
                value={result.base_crisis_prob === null ? "—" : pct(result.base_crisis_prob)}
                tone={alreadyOk ? "ok" : "warn"}
                note={`감내 기준 ${pct(result.max_crisis_prob)}`}
              />
              <Stat label="권장 차입" value={won(result.risk_based_limit)} />
            </div>
          </Section>

          {alreadyOk ? (
            <Section title="결과">
              <Notice tone="info" title="지금 조건으로 가능합니다">
                이 금액은 감내 기준 안에 들어와요. 조건을 바꾸지 않아도 됩니다.
              </Notice>
            </Section>
          ) : (
            <Section title="무엇을 바꾸면 되나">
              <div className="space-y-3">
                {reachable.map((l) => (
                  <Panel key={l.variable}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <Badge tone="ok">가능</Badge>
                        <span className="ml-2 text-[15px] font-semibold text-gov-head">{l.label}</span>
                      </div>
                      <div className="text-[14px] text-gov-ink2">
                        {pct(l.crisis_prob_before)} → <b className="text-gov-head">{pct(l.crisis_prob_after ?? 0)}</b>
                      </div>
                    </div>
                    <p className="mt-2 text-[15px] text-gov-head">
                      {leverFrom(l)} → <b>{leverValue(l)}</b>
                    </p>
                    <p className="mt-1 text-[13px] text-gov-ink2">{l.note}</p>
                    <p className="mt-1 text-[12px] text-gov-ink3">{rangeNote(l)}</p>
                  </Panel>
                ))}

                {blocked.map((l) => (
                  <Panel key={l.variable}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="warn">범위 밖</Badge>
                      <span className="text-[15px] font-semibold text-gov-head">{l.label}</span>
                    </div>
                    <p className="mt-2 text-[13px] text-gov-ink2">{l.note}</p>
                    <p className="mt-1 text-[12px] text-gov-ink3">{rangeNote(l)}</p>
                  </Panel>
                ))}

                {reachable.length === 0 && (
                  <Notice tone="warn" title="이 금액은 현실 범위에서 어렵습니다">
                    탐색한 범위 안에서는 감내 기준을 맞출 수 없었어요.
                    권장 차입 <b>{won(result.risk_based_limit)}</b> 쪽을 먼저 보시는 편이 좋겠습니다.
                  </Notice>
                )}
              </div>
            </Section>
          )}

          <Section title="이 숫자는 어디서 왔나">
            <Panel>
              <p className="text-[13px] leading-6 text-gov-ink2">
                {result.note} 각 항목의 <b>탐색 범위</b>를 함께 적어 둔 이유는, 범위를 넘는 제안(예: 생활비를
                절반으로)은 조언이 아니기 때문이에요. 범위 밖은 억지로 답을 만들지 않고 “범위 밖”으로 둡니다.
              </p>
              <p className="mt-2 text-[13px] text-gov-ink2">
                이 결과는 참고용이며 대출 심사 결과가 아닙니다.{" "}
                <Link href="/app/finance" className="text-gov-link underline">맞춤 금융지원</Link>
                에서 한도 3종을 나란히 볼 수 있어요.
              </p>
            </Panel>
          </Section>
        </>
      )}
    </>
  );
}
