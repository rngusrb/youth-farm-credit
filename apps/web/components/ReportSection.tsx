/** 리포트 본문 한 절. 번호는 읽는 순서를 뜻하므로 장식이 아니다. */
export default function ReportSection({
  n,
  title,
  lead,
  aside,
  children,
}: {
  n: string;
  title: string;
  lead?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="report-section border-t border-ink-800 pt-8">
      <div className="mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="tabular text-xs font-semibold tracking-widest text-signal-warn">
          {n}
        </span>
        <h2 className="text-lg font-semibold tracking-tight text-slate-100">{title}</h2>
        {aside && <div className="ml-auto text-xs text-slate-500">{aside}</div>}
      </div>
      {lead && (
        <p className="mb-5 max-w-2xl text-sm leading-relaxed text-slate-400">{lead}</p>
      )}
      {children}
    </section>
  );
}
