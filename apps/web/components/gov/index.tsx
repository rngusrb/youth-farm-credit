import SourceTag, { type SourceKind } from "@/components/SourceTag";
import Link from "next/link";

/** 정부 포털 공통 조각. 각진 모서리, 표 중심, 좌측 컬러바. */

export function Page({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-6xl px-4 py-9 sm:px-6 lg:py-11">{children}</main>;
}

export function Crumb({ trail }: { trail: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="현재 위치" className="no-print mb-4 flex flex-wrap items-center gap-1.5 text-[12px] text-gov-ink3">
      <Link href="/" className="inline-flex min-h-11 min-w-11 items-center justify-center hover:text-gov-link">홈</Link>
      {trail.map((t) => (
        <span key={t.label} className="flex items-center gap-1.5">
          <span aria-hidden>›</span>
          {t.href ? <Link href={t.href} className="inline-flex min-h-11 items-center hover:text-gov-link">{t.label}</Link>
                  : <span className="text-gov-ink2">{t.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function PageTitle({ title, lead, aside }: { title: string; lead?: string; aside?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b-2 border-gov-head pb-5">
      <div className="min-w-0">
        <h1 className="text-[30px] font-extrabold leading-[1.15] tracking-[-0.025em] text-gov-ink">{title}</h1>
        {lead && <p className="mt-2.5 max-w-3xl text-[15px] leading-[1.75] text-gov-ink2">{lead}</p>}
      </div>
      {aside}
    </div>
  );
}

export function Section({ title, action, children }: {
  title: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="mb-11">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="sec-title">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-gov-line bg-white p-6 shadow-card sm:p-7 ${className}`}>{children}</div>;
}

/** 정의형 표 — 정부 사이트의 기본 정보 표시 단위 */
/** 세 번째 원소는 값의 출처 (UX-010). 배지는 라벨 칸에만 들어간다 — 표가 주다. */
export type DefRow = [string, React.ReactNode, { src?: SourceKind; note?: string }?];

export function DefTable({ rows }: { rows: DefRow[] }) {
  return (
    <table className="w-full border-t border-gov-ink/70 text-[14px]">
      <tbody>
        {rows.map(([k, v, meta]) => (
          <tr key={k} className="border-b border-gov-line2">
            <th scope="row" className="w-40 bg-gov-sunk px-4 py-2.5 text-left align-top font-semibold text-gov-ink2">
              {k}
              {meta?.src && <SourceTag kind={meta.src} note={meta.note} />}
            </th>
            <td className="px-4 py-2.5 align-top">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Badge({ tone = "plain", children }: {
  tone?: "plain" | "ok" | "warn" | "danger" | "info"; children: React.ReactNode;
}) {
  const cls = {
    plain: "border-gov-line bg-gov-sunk text-gov-ink2",
    ok: "border-gov-ok/30 bg-gov-ok/10 text-gov-ok",
    warn: "border-gov-warn/30 bg-gov-warn/10 text-gov-warn",
    danger: "border-gov-point/30 bg-gov-point/10 text-gov-point",
    info: "border-gov-link/30 bg-gov-soft text-gov-head",
  }[tone];
  return (
    <span className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-[12px] font-semibold ${cls}`}>
      {children}
    </span>
  );
}

export function Stat({ label, value, unit, tone = "plain", note, src, srcNote }: {
  label: string; value: string; unit?: string;
  tone?: "plain" | "ok" | "warn" | "danger"; note?: string;
  /** 값의 출처 (UX-010). 배지는 라벨 쪽에 붙어 숫자를 가리지 않는다. */
  src?: SourceKind; srcNote?: string;
}) {
  const color = {
    plain: "text-gov-ink", ok: "text-gov-ok",
    warn: "text-gov-warn", danger: "text-gov-point",
  }[tone];
  return (
    <div>
      <div className="text-[12px] font-medium text-gov-ink3">
        {label}
        {src && <SourceTag kind={src} note={srcNote} />}
      </div>
      <div className={`tabular mt-1 text-[26px] font-extrabold leading-none ${color}`}>
        {value}{unit && <span className="ml-1 text-[14px] font-semibold text-gov-ink3">{unit}</span>}
      </div>
      {note && <div className="mt-1.5 text-[12px] leading-snug text-gov-ink3">{note}</div>}
    </div>
  );
}

export function Notice({ tone = "info", title, children }: {
  tone?: "info" | "warn" | "danger"; title?: string; children: React.ReactNode;
}) {
  const cls = {
    info: "border-gov-link/40 bg-gov-soft",
    warn: "border-gov-warn/40 bg-gov-warn/5",
    danger: "border-gov-point/40 bg-gov-point/5",
  }[tone];
  return (
    <div className={`rounded-r-lg border-l-4 ${cls} px-4 py-3`}>
      {title && <p className="mb-1 text-[13px] font-bold text-gov-ink">{title}</p>}
      <div className="text-[12px] leading-relaxed text-gov-ink2">{children}</div>
    </div>
  );
}

export function Empty({ title, body, cta }: {
  title: string; body: string; cta?: { href: string; label: string };
}) {
  return (
    <div className="rounded-lg border border-dashed border-gov-line bg-white px-5 py-14 text-center">
      <p className="text-[15px] font-semibold text-gov-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-gov-ink2">{body}</p>
      {cta && (
        <Link href={cta.href} className="mt-4 inline-flex min-h-11 items-center rounded-md bg-gov-head px-5 text-[13px] font-semibold text-white hover:bg-gov-navy">
          {cta.label}
        </Link>
      )}
    </div>
  );
}

export function Btn({ href, onClick, variant = "primary", type = "button", disabled, children }: {
  href?: string; onClick?: () => void; variant?: "primary" | "ghost";
  type?: "button" | "submit"; disabled?: boolean; children: React.ReactNode;
}) {
  const cls = variant === "primary"
    ? "bg-gov-head text-white shadow-sm hover:bg-gov-navy disabled:opacity-50"
    : "rounded-lg border border-gov-line bg-white text-gov-ink2 hover:border-gov-link hover:text-gov-head";
  const base = `inline-flex min-h-11 items-center justify-center rounded-md px-4 text-[13px] font-semibold ${cls}`;
  return href
    ? <Link href={href} className={base}>{children}</Link>
    : <button type={type} onClick={onClick} disabled={disabled} className={base}>{children}</button>;
}
