import type { Diagnosis } from "@/lib/api";
import AsOfLine from "./AsOf";
import { pct, pyeong as fmtPyeong, won } from "@/lib/format";

/**
 * 표지. 결론을 맨 앞에 크게 둔다 — 읽는 사람은 분석이 아니라 답을 받으러 왔다.
 * 숫자 하나가 지면을 지배하고, 나머지는 그 숫자를 설명하는 자리에 선다.
 */
export default function ReportCover({ data }: { data: Diagnosis }) {
  const noCapacity = data.status === "no_capacity";
  const livelihood = data.limits.binding_constraint === "livelihood";
  const issued = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <header className="report-cover">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-[12px]">
        <span className="font-semibold tracking-[0.02em] text-paper-accent">
          갚는 데 쓸 돈 진단 리포트
        </span>
        <span className="tabular text-paper-ink3">
          발행 {issued} · 문서 {data.document_ref}
        </span>
      </div>

      {/* 발행일은 오늘이지만 숫자는 아니다. 바로 옆에 붙여 오해를 끊는다. */}
      <AsOfLine as_of={data.as_of} className="mt-2" />

      <h1 className="mt-8 text-[1.6rem] font-bold leading-snug text-paper-ink sm:text-[1.9rem]">
        {data.input.crop_name} {fmtPyeong(data.input.pyeong)}
      </h1>
      <p className="mt-1 text-sm text-paper-ink2">{data.product.name}</p>

      {/* 결론 — 지면에서 가장 큰 것 */}
      <div className="mt-10 border-y-2 border-paper-ink py-8">
        {noCapacity ? (
          <>
            <p className="text-xs font-semibold tracking-[0.02em] text-paper-danger">
              진단
            </p>
            <p className="mt-3 text-[1.7rem] font-bold leading-[1.35] text-paper-ink sm:text-[2.1rem]">
              대출을 받기 전에
              <br />
              생계부터 맞춰야 합니다
            </p>
          </>
        ) : livelihood ? (
          <>
            <p className="text-xs font-semibold tracking-[0.02em] text-paper-danger">
              진단
            </p>
            <p className="mt-3 text-[1.7rem] font-bold leading-[1.35] text-paper-ink sm:text-[2.1rem]">
              빌리는 금액을 조절해
              <br />
              해결되는 상황이 아닙니다
            </p>
          </>
        ) : (
          <>
            <p className="text-xs font-semibold tracking-[0.02em] text-paper-ink3">
              2년 연속 대출을 제때 갚지 못할 확률 {pct(data.limits.max_crisis_prob)} 기준
            </p>
            <p className="tabular mt-2 text-[3rem] font-bold leading-none text-paper-ink sm:text-[4rem]">
              {won(data.limits.risk_based)}
            </p>
          </>
        )}

        <p className="prose-w mt-5 text-[0.95rem] leading-[1.85] text-paper-ink2">
          {noCapacity ? (
            <>
              한 해 농사로 번 돈이 생활비를 넘지 못해 대출을 갚는 데 쓸 돈이 남지 않습니다.
              같은 작목으로 제도 한도까지 차입하려면 최소{" "}
              <b className="tabular font-semibold text-paper-ink">
                {fmtPyeong(data.min_area_pyeong)}
              </b>{" "}
              규모가 필요합니다.
            </>
          ) : livelihood ? (
            <>
              대출을 한 푼도 받지 않아도 소득이 생활비 아래로 떨어져 2년 연속 적자가 날
              확률이{" "}
              <b className="tabular font-semibold text-paper-danger">
                {pct(data.limits.livelihood_floor_prob)}
              </b>
              입니다. 빌리는 금액을 줄여도 이 부분은 달라지지 않습니다 — 재배 규모나 생활비
              기준을 먼저 보셔야 합니다.
            </>
          ) : (
            <>
              제도상 <b className="tabular">{won(data.limits.available)}</b>, 은행 심사
              관행으로 <b className="tabular">{won(data.limits.recommended)}</b>까지 신청할
              수 있습니다. 농사로 번 돈이 해마다 흔들리는 것까지 넣어 계산하면, 2년 연속 상환이
              밀릴 확률이 {pct(data.limits.max_crisis_prob)}를 넘지 않는 금액이 위 금액입니다.
            </>
          )}
        </p>

        {/* 규칙 7 — 한계를 먼저 밝힌다. 뒤에 숨기면 변명, 앞에 두면 근거다. */}
        {!noCapacity && (
          <p className="prose-w mt-3 border-t border-paper-rule pt-3 text-[0.8rem] leading-relaxed text-paper-ink3">
            재해 시 이자 감면은 넣지 않아 보수적이고, 농신보 보증료는 빼고 계산해 그만큼
            낙관적입니다. 자세한 것은 「이 보고서가 쓴 근거」에 있습니다.
          </p>
        )}
      </div>

      {/* 계산의 출발점 */}
      <dl className="mt-6 grid grid-cols-1 gap-x-8 sm:grid-cols-2 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
        <Fact k="한 해 농사로 번 돈" v={won(data.income.annual)} />
        <Fact k="생활비" v={won(data.input.living_cost)} />
        <Fact
          k="기존 대출에 갚는 돈"
          v={data.input.other_debt_service > 0 ? won(data.input.other_debt_service) : "없음"}
        />
        <Fact
          k="대출을 갚는 데 쓸 돈"
          v={won(data.income.capacity)}
          danger={data.income.capacity <= 0}
        />
      </dl>
    </header>
  );
}

function Fact({ k, v, danger }: { k: string; v: string; danger?: boolean }) {
  return (
    <div>
      <dt className="text-[12px] text-paper-ink3">{k}</dt>
      <dd
        className={`tabular mt-0.5 text-[0.95rem] font-semibold ${
          danger ? "text-paper-danger" : "text-paper-ink"
        }`}
      >
        {v}
      </dd>
    </div>
  );
}
