"use client";

import { useState } from "react";
import { askRegulation, type RegulationAnswer } from "@/lib/api";
import CitationBlock from "./CitationBlock";

const PRESETS = [
  "직장 다니면서 신청할 수 있나요?",
  "나이 제한이 어떻게 되나요?",
  "재해가 나면 상환을 미룰 수 있나요?",
];

export default function RegulationAsk({ context }: { context: Record<string, unknown> }) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<RegulationAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await askRegulation(q, context));
    } catch (e) {
      setError(e instanceof Error ? e.message : "질의에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="제도 요건을 물어보세요"
          className="flex-1 min-h-11 rounded-lg border border-paper-rule bg-paper-panel px-4 text-sm outline-none placeholder:text-paper-ink3 focus:border-paper-accent"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg border border-paper-rule px-4 text-sm text-paper-ink2 transition hover:border-paper-ink3 disabled:opacity-40"
        >
          질의
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => {
              setQuestion(p);
              ask(p);
            }}
            className="rounded-full border border-paper-rule px-3 py-1 text-xs text-paper-ink3 transition hover:border-paper-ink3 hover:text-paper-ink2"
          >
            {p}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-paper-danger">{error}</p>}

      {result && (
        <div className="mt-5">
          <p className="text-sm leading-relaxed text-paper-ink">{result.answer}</p>
          <div className="mt-4">
            <CitationBlock citations={result.citations} />
          </div>
          {result.citations.length > 0 && (
            <p className="mt-2 text-[12px] text-paper-ink3">
              근거 확신도: {result.confidence} · 인용 원문은 요약하지 않고 그대로 표시합니다.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
