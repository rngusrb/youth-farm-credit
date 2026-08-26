"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/shell/PageHeader";
import Disclaimer from "@/components/shell/Disclaimer";
import { Card, Page, Pill } from "@/components/ui";
import { askRegulation, type RegulationAnswer } from "@/lib/api";

/** 제도 근거 검색.
 *
 * 근거를 못 찾으면 답을 만들지 않는다. 이건 기능 부족이 아니라 설계다 —
 * 시행지침을 잘못 안내하면 사람이 실제로 손해를 본다.
 */
const CONFIDENCE: Record<RegulationAnswer["confidence"], string> = {
  high: "높음",
  medium: "보통",
  low: "낮음",
  none: "근거 없음",
};

const SUGGESTED = [
  "거치기간은 최대 몇 년까지 선택할 수 있나",
  "재해로 피해를 입으면 상환을 연기할 수 있나",
  "이자는 언제 내나",
  "융자 한도는 얼마인가",
  "의무영농기간을 어기면 어떻게 되나",
  "지원 자격 나이 제한",
];

function PolicyBody() {
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const [result, setResult] = useState<RegulationAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (question: string) => {
    if (!question.trim()) return;
    setBusy(true);
    setError(null);
    setQ(question);
    try {
      setResult(await askRegulation(question));
    } catch (e) {
      setError(e instanceof Error ? e.message : "검색에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }, []);

  // 대시보드에서 ?q= 로 넘어오면 바로 실행한다.
  useEffect(() => {
    const initial = params.get("q");
    if (initial) void run(initial);
  }, [params, run]);

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(q);
        }}
        className="flex gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="예: 재해가 나면 상환을 미룰 수 있나요?"
          className="flex-1 rounded-lg border border-ink-700 bg-ink-900 px-4 py-3 text-sm outline-none transition placeholder:text-slate-600 focus:border-signal-warn"
        />
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded-lg bg-signal-warn px-5 text-sm font-semibold text-ink-950 transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "찾는 중" : "찾기"}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {SUGGESTED.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => void run(s)}
            className="rounded-full border border-ink-700 px-3 py-1 text-[11px] text-slate-400 transition hover:border-ink-600 hover:text-slate-200"
          >
            {s}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-5 rounded-lg border border-signal-danger/40 bg-signal-danger/10 px-4 py-3 text-sm text-signal-danger">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-7">
          <Card>
            <div className="mb-2 flex items-center gap-2">
              <Pill
                tone={
                  { high: "ok", medium: "info", low: "warn", none: "danger" }[
                    result.confidence
                  ] as "ok" | "info" | "warn" | "danger"
                }
              >
                확신도 {CONFIDENCE[result.confidence]}
              </Pill>
              <span className="text-[11px] text-slate-600">
                근거 {result.citations.length}건
              </span>
            </div>
            <p className="text-sm leading-relaxed text-slate-200">{result.answer}</p>
          </Card>

          <h2 className="mb-3 mt-6 text-[13px] font-semibold uppercase tracking-[0.06em] text-slate-400">
            근거 조항 원문
          </h2>
          <ul className="space-y-3">
            {result.citations.map((c, i) => (
              <li key={i} className="rounded-xl border border-ink-800 bg-ink-900/50 p-4">
                <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-xs font-medium text-slate-300">{c.doc}</span>
                  <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[11px] text-slate-400">
                    {c.section}
                  </span>
                  {c.url && (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto text-[11px] text-slate-500 underline decoration-ink-600 underline-offset-2 hover:text-slate-300"
                    >
                      원문 파일 ↗
                    </a>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-400">
                  {c.text}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

export default function PolicyPage() {
  return (
    <Page>
      <PageHeader
        title="제도 근거"
        lead="농림축산식품부 2026년 시행지침 3종의 원문에서 근거 조항을 찾습니다. 조항을 찾지 못하면 답변을 만들어내지 않습니다."
      />
      <Suspense fallback={<p className="text-sm text-slate-500">불러오는 중…</p>}>
        <PolicyBody />
      </Suspense>
      <Disclaimer />
    </Page>
  );
}
