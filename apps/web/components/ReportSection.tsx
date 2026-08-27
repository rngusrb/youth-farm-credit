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
    <section className="report-section">
      <div className="mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-paper-rule pb-3">
        <span className="tabular text-[12px] font-semibold tracking-[0.18em] text-paper-accent">
          {n}
        </span>
        <h2 className="text-[1.6rem] font-bold leading-tight tracking-[-0.015em] text-paper-ink">
          {title}
        </h2>
        {aside && <div className="ml-auto text-xs text-paper-ink3">{aside}</div>}
      </div>
      {lead && (
        <p className="prose-w mb-7 text-[1rem] leading-[1.9] text-paper-ink2">{lead}</p>
      )}
      {children}
    </section>
  );
}
