import type { Citation } from "@/lib/api";

/** 조항 인용 블록 — 청크 원문 그대로. 요약·재작성 금지. */
export default function CitationBlock({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) {
    return (
      <p className="rounded-lg border border-paper-rule bg-paper-panel p-4 text-sm text-paper-ink2">
        확인된 근거를 찾지 못했습니다. 근거 조항 없이는 답변을 생성하지 않습니다.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {citations.map((c, i) => (
        <li key={`${c.doc}-${c.section}-${i}`} className="rounded-lg border border-paper-rule bg-paper-panel p-4">
          <div className="flex flex-wrap items-baseline gap-2 text-xs text-paper-ink3">
            <span className="font-medium text-paper-ink2">{c.doc}</span>
            {c.doc_year && <span>{c.doc_year}</span>}
            <span className="rounded bg-paper-soft px-1.5 py-0.5 font-mono text-[11px] text-paper-ink2">
              {c.section}
            </span>
            {c.region && <span>{c.region}</span>}
          </div>
          <blockquote className="mt-2 border-l-2 border-paper-ink3 pl-3 text-sm leading-relaxed text-paper-ink2">
            {c.text}
          </blockquote>
          {c.url && (
            <a
              href={c.url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-xs text-paper-accent hover:underline"
            >
              원문 보기 →
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
