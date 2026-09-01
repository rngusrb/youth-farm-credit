"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Badge, Notice, PageTitle, Panel } from "@/components/gov";
import { consult, type ConsultAnswer, type TraceEntry } from "@/lib/api";
import { pct, won } from "@/lib/format";
import { loadProfile } from "@/lib/profile";

/** AI 상담.
 *
 * **화면이 분기를 판단하지 않는다.** 어떤 계산 도구를 어떤 순서로 부를지는
 * 서버의 Planner 가 정하고, 화면은 그 결과와 **무엇을 했는지(trace)** 를 보여준다.
 *
 * 숫자는 언제나 엔진이 만든다. 설명 문장의 수치는 엔진 값과 대조해 어긋난 문장을
 * 걸러낸 뒤 오고, 걸러진 개수도 숨기지 않고 표시한다.
 */
type Turn =
  | { role: "user"; text: string }
  | { role: "agent"; answer: ConsultAnswer }
  | { role: "error"; text: string };

const EXAMPLES = [
  "3억 빌려도 되나요?",
  "재해가 나면 상환을 미룰 수 있나요?",
  "얼마까지 빌릴 수 있어요?",
  "거치기간은 몇 년까지 고를 수 있나요?",
];

const TOOL_LABEL: Record<string, string> = {
  get_crop: "작목 데이터 조회",
  diagnose: "상환여력·한도 계산",
  cashflow: "월별 현금흐름",
  stress: "스트레스 시나리오",
  solve_for: "조건 역산(반사실 탐색)",
  search_regulation: "시행지침 검색",
  eligibility: "지원 요건 조회",
};

function TraceList({ trace, budget, method }: {
  trace: TraceEntry[];
  budget: { llm_calls: number; tool_calls: number };
  method: string;
}) {
  if (trace.length === 0) return null;
  return (
    <details className="mt-3 border-t border-gov-line pt-3">
      <summary className="cursor-pointer text-[12px] text-gov-ink2">
        무엇을 했는지 보기 ({trace.length}단계)
      </summary>
      <ul className="mt-2 space-y-1">
        {trace.map((t, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2 text-[12px]">
            <span className={t.ok ? "text-gov-ink2" : "text-gov-warn"}>{t.ok ? "✓" : "✕"}</span>
            <span className="text-gov-head">{TOOL_LABEL[t.tool] ?? t.tool}</span>
            <span className="text-gov-ink3">{t.ms}ms</span>
            {t.error && <span className="text-gov-warn">{t.error}</span>}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-gov-ink3">
        계획 {method === "fallback" ? "규칙기반" : "AI"} · 언어모델 {budget.llm_calls}회 · 도구 {budget.tool_calls}회
      </p>
    </details>
  );
}

/** 숫자 카드는 설명 문장이 아니라 **도구 결과**에서 읽는다. */
function Facts({ results }: { results: Record<string, any> }) {
  const d = results.diagnose;
  const s = results.solve_for;
  if (!d && !s) return null;

  return (
    <div className="mt-3 space-y-3">
      {d && (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["권장 차입", won(d.limits.risk_based)],
            ["상환 가용액", won(d.income.capacity)],
            ["감내 기준", pct(d.limits.max_crisis_prob)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-gov-line bg-gov-sunk px-3 py-2">
              <p className="text-[12px] text-gov-ink2">{k}</p>
              <p className="text-[15px] font-semibold text-gov-head">{v}</p>
            </div>
          ))}
        </div>
      )}
      {s && Array.isArray(s.levers) && (
        <div className="rounded-lg border border-gov-line px-3 py-2">
          <p className="mb-1 text-[12px] text-gov-ink2">
            {won(s.target_principal)} 을 감당하려면
          </p>
          <ul className="space-y-1">
            {s.levers.map((l: any) => (
              <li key={l.variable} className="text-[13px]">
                {l.reachable ? (
                  <span className="text-gov-head">
                    · {l.note}{" "}
                    <span className="text-gov-ink2">
                      ({pct(l.crisis_prob_before)} → {pct(l.crisis_prob_after)})
                    </span>
                  </span>
                ) : (
                  <span className="text-gov-ink3">· {l.label}: {l.note}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-gov-ink3">
            <Link href="/app/levers" className="text-gov-link underline">얼마까지 받으려면</Link>
            에서 탐색 범위까지 볼 수 있어요.
          </p>
        </div>
      )}
    </div>
  );
}

export default function AssistantPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setQ("");
    setBusy(true);
    setTurns((t) => [...t, { role: "user", text }]);
    try {
      const p = loadProfile();
      const answer = await consult({
        question: text,
        slots: p
          ? {
              crop_id: p.cropId,
              pyeong: p.pyeong,
              living_cost: p.livingCost,
              other_debt_service: p.otherDebtService,
            }
          : {},
      });
      setTurns((t) => [...t, { role: "agent", answer }]);
    } catch (e) {
      setTurns((t) => [...t, { role: "error", text: e instanceof Error ? e.message : "처리에 실패했어요." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle
        title="AI 상담"
        lead="질문을 보고 필요한 계산 도구를 골라 실행합니다. 숫자는 계산 엔진이 만들고, 설명에 쓰인 수치는 엔진 값과 대조해 어긋나면 걸러냅니다."
      />

      <div className="space-y-4">
        {turns.length === 0 && (
          <Panel>
            <p className="mb-3 text-[14px] text-gov-ink2">이런 걸 물어볼 수 있어요.</p>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((e) => (
                <button
                  key={e}
                  onClick={() => void send(e)}
                  className="inline-flex min-h-11 items-center rounded-md border border-gov-line px-3 text-[12px] text-gov-ink2 hover:border-gov-link hover:text-gov-head"
                >
                  {e}
                </button>
              ))}
            </div>
          </Panel>
        )}

        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[80%] rounded-lg bg-gov-soft px-4 py-2.5 text-[14px] text-gov-ink">{t.text}</p>
            </div>
          ) : t.role === "error" ? (
            <Notice key={i} tone="warn" title="처리하지 못했어요">{t.text}</Notice>
          ) : t.answer.kind === "ask" ? (
            <Panel key={i}>
              <Badge tone="info">되묻기</Badge>
              <p className="mt-2 text-[15px] text-gov-head">{t.answer.question}</p>
              <p className="mt-1 text-[13px] text-gov-ink2">
                답을 지어내지 않으려고 여쭤봐요.{" "}
                <Link href="/app/farm" className="text-gov-link underline">내 농가 정보</Link>
                에 넣어 두시면 다음부터 안 물어봅니다.
              </p>
              <TraceList trace={t.answer.trace} budget={t.answer.budget} method={t.answer.method} />
            </Panel>
          ) : (
            <Panel key={i}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone={t.answer.method === "fallback" ? "plain" : "info"}>
                  {t.answer.method === "fallback" ? "규칙기반" : "AI 상담"}
                </Badge>
                {t.answer.numbers_used.length > 0 && (
                  <span className="text-[12px] text-gov-ink3">
                    수치 {t.answer.numbers_used.length}개를 엔진 값과 대조했어요
                  </span>
                )}
              </div>

              {t.answer.text && (
                <p className="whitespace-pre-line text-[14px] leading-7 text-gov-ink">{t.answer.text}</p>
              )}

              <Facts results={t.answer.results} />

              {t.answer.dropped.length > 0 && (
                <p className="mt-3 text-[12px] text-gov-warn">
                  숫자가 엔진 값과 맞지 않아 {t.answer.dropped.length}문장을 뺐어요.
                </p>
              )}

              {t.answer.citations.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-gov-line pt-3">
                  {t.answer.citations.slice(0, 3).map((c, k) => (
                    <details key={k}>
                      <summary className="cursor-pointer text-[12px] text-gov-link">
                        {c.doc} {c.section}
                      </summary>
                      <p className="mt-1 whitespace-pre-line text-[12px] leading-6 text-gov-ink2">{c.text}</p>
                    </details>
                  ))}
                </div>
              )}

              <TraceList trace={t.answer.trace} budget={t.answer.budget} method={t.answer.method} />
            </Panel>
          ),
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); void send(q); }}
        className="mt-4 flex gap-2"
      >
        <label className="flex-1">
          <span className="sr-only">질문</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="궁금한 것을 물어보세요"
            className="w-full rounded-lg border border-gov-line px-3 py-2.5 text-[14px]"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-11 items-center rounded-md bg-gov-head px-5 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? "계산 중…" : "물어보기"}
        </button>
      </form>
    </>
  );
}
