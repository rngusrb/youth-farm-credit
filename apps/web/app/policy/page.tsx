"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge, Crumb, Notice, Page, PageTitle, Panel } from "@/components/gov";
import { askRegulation, type RegulationAnswer } from "@/lib/api";

const CONFIDENCE: Record<RegulationAnswer["confidence"], { label: string; tone: "ok" | "info" | "warn" | "danger" }> = {
  high: { label: "높음", tone: "ok" },
  medium: { label: "보통", tone: "info" },
  low: { label: "낮음", tone: "warn" },
  none: { label: "근거 없음", tone: "danger" },
};

const SUGGESTED = [
  "거치기간은 최대 몇 년까지 선택할 수 있나",
  "재해로 피해를 입으면 상환을 연기할 수 있나",
  "이자는 언제 내나",
  "융자 한도는 얼마인가",
  "의무영농기간을 어기면 어떻게 되나",
  "지원 자격 나이 제한",
];

function Body() {
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const [result, setResult] = useState<RegulationAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (question: string) => {
    if (!question.trim()) return;
    setBusy(true); setError(null); setQ(question);
    try {
      setResult(await askRegulation(question));
    } catch (e) {
      setError(e instanceof Error ? e.message : "검색에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const initial = params.get("q");
    if (initial) void run(initial);
  }, [params, run]);

  return (
    <>
      <Panel>
        <form onSubmit={(e) => { e.preventDefault(); void run(q); }} className="flex gap-2">
          <label htmlFor="q" className="sr-only">검색어</label>
          <input
            id="q" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="예: 재해가 나면 상환을 미룰 수 있나요?"
            className="flex-1 min-h-11 rounded-md border border-gov-line px-4 text-[14px] outline-none focus:border-gov-link"
          />
          <button type="submit" disabled={busy}
                  className="shrink-0 rounded-md bg-gov-head px-6 text-[14px] font-bold text-white hover:bg-gov-navy disabled:opacity-50">
            {busy ? "검색 중" : "검색"}
          </button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-gov-ink3">추천 검색어</span>
          {SUGGESTED.map((s) => (
            <button key={s} onClick={() => void run(s)}
                    className="inline-flex min-h-11 items-center rounded-md border border-gov-line px-3 text-[12px] text-gov-ink2 hover:border-gov-link hover:text-gov-head">
              {s}
            </button>
          ))}
        </div>
      </Panel>

      {error && <div className="mt-5"><Notice tone="danger">{error}</Notice></div>}

      {result && (
        <div className="mt-7">
          <Panel>
            <div className="mb-2.5 flex flex-wrap items-center gap-2">
              <Badge tone={CONFIDENCE[result.confidence].tone}>
                확신도 {CONFIDENCE[result.confidence].label}
              </Badge>
              <span className="text-[12px] text-gov-ink3">근거 {result.citations.length}건</span>
            </div>
            <p className="text-[15px] leading-relaxed text-gov-ink">{result.answer}</p>
          </Panel>

          <h2 className="sec-title mb-3 mt-7">근거 조항 원문</h2>
          <ul className="space-y-3">
            {result.citations.map((c, i) => (
              <li key={i}>
                <figure className="rounded-lg border border-gov-line bg-white">
                  <figcaption className="flex flex-wrap items-center gap-2 border-b border-gov-line2 bg-gov-sunk px-4 py-2.5">
                    <Badge tone="info">{c.section}</Badge>
                    <span className="text-[12px] font-medium text-gov-ink2">{c.doc}</span>
                    {c.doc_year && <span className="text-[12px] text-gov-ink3">{c.doc_year}</span>}
                    {c.url && (
                      <a href={c.url} target="_blank" rel="noreferrer" className="lnk ml-auto text-[12px]">
                        원문 파일 ↗
                      </a>
                    )}
                  </figcaption>
                  <blockquote className="whitespace-pre-wrap px-4 py-3.5 text-[13px] leading-relaxed text-gov-ink2">
                    {c.text}
                  </blockquote>
                </figure>
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
      <Crumb trail={[{ label: "제도 · 자료" }, { label: "제도 근거 검색" }]} />
      <PageTitle
        title="제도 근거 검색"
        lead="농림축산식품부 2026년 시행지침 3종의 원문에서 근거 조항을 찾습니다. 조항을 찾지 못하면 답변을 만들어내지 않습니다."
      />
      <div id="main">
        <Suspense fallback={<p className="text-[14px] text-gov-ink2">불러오는 중…</p>}>
          <Body />
        </Suspense>
        <div className="mt-8">
          <Notice tone="warn" title="안내의 한계">
            검색 결과는 원문을 찾아 주는 것이지 유권해석이 아닙니다. 자격·의무·환수처럼
            불이익이 걸린 사항은 관할 시·군·구 담당자에게 확인하시기 바랍니다.
          </Notice>
        </div>
      </div>
    </Page>
  );
}
