export default function PageHeader({
  title,
  lead,
  aside,
}: {
  title: string;
  lead?: string;
  aside?: React.ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-ink-800 pb-5">
      <div className="min-w-0">
        <h1 className="font-serif text-[22px] font-bold tracking-tight">{title}</h1>
        {lead && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-400">{lead}</p>}
      </div>
      {aside}
    </header>
  );
}
