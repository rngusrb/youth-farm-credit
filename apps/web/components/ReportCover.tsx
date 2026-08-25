import type { Diagnosis } from "@/lib/api";
import { pct, pyeong as fmtPyeong, won } from "@/lib/format";

/**
 * 리포트 표지. 결론을 맨 앞에 크게 둔다 — 읽는 사람은 분석이 아니라 답을
 * 받으러 왔다. 분석은 뒤에서 이 결론을 떠받친다.
 */
export default function ReportCover({ data }: { data: Diagnosis }) {
  const noCapacity = data.status === "no_capacity";
  const livelihood = data.limits.binding_constraint === "livelihood";
  const headline = noCapacity || livelihood ? 0 : data.limits.risk_based;
  const issued = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <header className="report-cover">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-700 pb-3">
        <span className="text-xs font-semibold tracking-[0.2em] text-signal-warn">
          상환여력 진단 리포트
        </span>
        <span className="tabular text-[11px] text-slate-500">
          발행 {issued} · 문서 {data.diagnosis_id.slice(3, 15)}
        </span>
      </div>

      <dl className="mt-5 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <Row k="작목 · 규모" v={`${data.input.crop_name} ${fmtPyeong(data.input.pyeong)}`} />
        <Row k="대상 자금" v={data.product.name} />
        <Row
          k="연 농업소득"
          v={won(data.income.annual)}
          sub={`생활비 ${won(data.input.living_cost)}${
            data.input.other_debt_service > 0
              ? ` · 기존부채 ${won(data.input.other_debt_service)}`
              : ""
          }`}
        />
        <Row
          k="상환에 쓸 수 있는 돈"
          v={won(data.income.capacity)}
          danger={data.income.capacity <= 0}
        />
      </dl>

      <div className="mt-8 rounded-2xl border border-ink-700 bg-ink-900 p-6 sm:p-8">
        {noCapacity ? (
          <>
            <p className="text-xs uppercase tracking-wider text-signal-danger">진단</p>
            <p className="mt-2 text-2xl font-bold leading-snug text-slate-50 sm:text-3xl">
              이 조건에서는 대출을 받기 전에
              <br />
              생계부터 맞춰야 합니다
            </p>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400">
              연간 농업소득이 생활비를 넘지 못해, 상환에 쓸 수 있는 돈이 남지 않습니다.
              같은 작목으로 제도 한도까지 차입하려면 최소{" "}
              <span className="tabular font-semibold text-slate-200">
                {fmtPyeong(data.min_area_pyeong)}
              </span>{" "}
              규모가 필요합니다.
            </p>
          </>
        ) : livelihood ? (
          <>
            <p className="text-xs uppercase tracking-wider text-signal-danger">결론</p>
            <p className="mt-2 text-2xl font-bold leading-snug text-slate-50 sm:text-3xl">
              지금은 차입 규모를 조절해
              <br />
              해결되는 상황이 아닙니다
            </p>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400">
              대출을 한 푼도 받지 않아도 소득이 생활비 아래로 떨어져 2년 연속 적자가 날
              확률이{" "}
              <span className="tabular font-semibold text-signal-danger">
                {pct(data.limits.livelihood_floor_prob)}
              </span>
              입니다. 재배 규모나 생활비 기준을 먼저 손봐야 합니다.
            </p>
          </>
        ) : (
          <>
            <p className="text-xs uppercase tracking-wider text-slate-500">
              이 조건에서 감당할 수 있는 차입 규모
            </p>
            <p className="tabular mt-2 text-4xl font-bold text-slate-50 sm:text-5xl">
              {won(headline)}
            </p>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400">
              제도상 신청은 <span className="tabular">{won(data.limits.available)}</span>
              까지, 은행 심사 관행(DSCR {data.target_dscr.toFixed(2)})으로는{" "}
              <span className="tabular">{won(data.limits.recommended)}</span>까지
              가능합니다. 다만 농업소득이 해마다 흔들리는 것까지 계산에 넣으면, 2년 연속
              상환이 밀릴 확률을 {pct(data.limits.max_crisis_prob)} 이하로 유지하는
              금액은 위와 같습니다.
            </p>
          </>
        )}
      </div>
    </header>
  );
}

function Row({
  k,
  v,
  sub,
  danger,
}: {
  k: string;
  v: string;
  sub?: string;
  danger?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-ink-800/70 pb-1.5">
      <dt className="shrink-0 text-xs text-slate-500">{k}</dt>
      <dd className="text-right">
        <span
          className={`tabular font-medium ${danger ? "text-signal-danger" : "text-slate-200"}`}
        >
          {v}
        </span>
        {sub && <span className="block text-[11px] text-slate-600">{sub}</span>}
      </dd>
    </div>
  );
}
