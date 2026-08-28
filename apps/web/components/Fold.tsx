"use client";

/**
 * 결론을 남기고 근거를 접는다 (UX-001).
 *
 * 왜 있나: 세 팀원 모두 "정보량이 많다"고 했고, 동시에 세 명 모두 "근거가
 * 설득력 있다"고 했다. 그래서 **지우지 않고 접는다.** 요약 줄은 항상 보이고,
 * 근거는 펼쳐야 나온다.
 *
 * `<details>` 를 쓰는 이유: 키보드·스크린리더 동작이 브라우저에 이미 들어 있다.
 * 직접 만든 토글은 그걸 매번 다시 틀린다.
 */
export default function Fold({
  summary,
  hint,
  children,
  open = false,
  tone = "paper",
  className = "",
}: {
  /** 접혀 있어도 보이는 한 줄. 판정·지시가 아니라 사실을 적는다 (화법 규칙 2·3). */
  summary: React.ReactNode;
  /** 펼치면 무엇이 나오는지. 없으면 안 그린다. */
  hint?: string;
  children: React.ReactNode;
  open?: boolean;
  tone?: "paper" | "gov";
  className?: string;
}) {
  const c =
    tone === "gov"
      ? { box: "border-gov-line bg-white", sum: "text-gov-ink", hint: "text-gov-ink3", body: "border-gov-line2" }
      : { box: "border-paper-rule bg-paper-panel", sum: "text-paper-ink", hint: "text-paper-ink3", body: "border-paper-rule" };

  return (
    <details open={open} className={`fold group rounded-xl border ${c.box} ${className}`}>
      <summary
        className={`flex min-h-11 cursor-pointer list-none items-center gap-3 px-5 py-3.5 text-[14px] font-semibold ${c.sum} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`}
      >
        <span
          aria-hidden
          className="shrink-0 text-[12px] leading-none transition-transform group-open:rotate-90 motion-reduce:transition-none"
        >
          ▶
        </span>
        <span className="min-w-0 flex-1">{summary}</span>
        {hint && (
          <span className={`no-print shrink-0 text-[12px] font-normal ${c.hint}`}>{hint}</span>
        )}
      </summary>
      <div className={`border-t px-5 py-5 ${c.body}`}>{children}</div>
    </details>
  );
}
