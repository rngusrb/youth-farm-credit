import Link from "next/link";

/** 대시보드 공통 조각. 리포트(.sheet)와 색계가 다르다 — 여기는 앱, 저기는 문서. */

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-ink-800 bg-ink-900/50 p-5 ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  href,
  action,
}: {
  children: React.ReactNode;
  href?: string;
  action?: string;
}) {
  return (
    <div className="mb-3.5 flex items-baseline justify-between gap-3">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-slate-400">
        {children}
      </h2>
      {href && (
        <Link href={href} className="shrink-0 text-xs text-slate-500 transition hover:text-slate-300">
          {action ?? "전체"} →
        </Link>
      )}
    </div>
  );
}

/** 큰 숫자 하나. 대시보드의 기본 단위다. */
export function Stat({
  label,
  value,
  unit,
  tone = "plain",
  note,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: "plain" | "ok" | "warn" | "danger";
  note?: string;
}) {
  const color = {
    plain: "text-slate-100",
    ok: "text-signal-ok",
    warn: "text-signal-warn",
    danger: "text-signal-danger",
  }[tone];
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.06em] text-slate-500">{label}</div>
      <div className={`tabular mt-1 text-2xl font-semibold leading-none ${color}`}>
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-slate-500">{unit}</span>}
      </div>
      {note && <div className="mt-1.5 text-[11px] leading-snug text-slate-500">{note}</div>}
    </div>
  );
}

/** 상태 알약. 색만으로 뜻을 전달하지 않도록 항상 글자를 같이 낸다. */
export function Pill({
  tone = "plain",
  children,
}: {
  tone?: "plain" | "ok" | "warn" | "danger" | "info";
  children: React.ReactNode;
}) {
  const cls = {
    plain: "border-ink-600 text-slate-400",
    ok: "border-signal-ok/40 text-signal-ok",
    warn: "border-signal-warn/40 text-signal-warn",
    danger: "border-signal-danger/40 text-signal-danger",
    info: "border-signal-calm/40 text-signal-calm",
  }[tone];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}
    >
      {children}
    </span>
  );
}

export function Empty({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="rounded-xl border border-dashed border-ink-700 px-5 py-8 text-center">
      <p className="text-sm font-medium text-slate-300">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-slate-500">{body}</p>
      {cta && (
        <Link
          href={cta.href}
          className="mt-4 inline-block rounded-lg bg-signal-warn px-4 py-2 text-xs font-semibold text-ink-950 transition hover:brightness-110"
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}

/** 페이지 공통 여백. 모든 대시보드 화면이 같은 폭을 쓴다. */
export function Page({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-6xl px-5 py-8 lg:px-8">{children}</main>;
}
