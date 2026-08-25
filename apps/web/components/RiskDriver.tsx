import type { Diagnosis } from "@/lib/api";

type Factors = NonNullable<Diagnosis["factors"]>;

const PRESCRIPTION: Record<string, { label: string; what: string; moves: string[] }> = {
  price: {
    label: "가격",
    what: "수확량은 비교적 안정적인데, 받는 값이 해마다 크게 달라집니다.",
    moves: [
      "계약재배·수매 약정으로 판매가를 미리 묶기",
      "출하 시기를 나눠 한 시점 시세에 몰리지 않기",
      "저장·가공으로 출하 시점을 옮길 여지 확인하기",
    ],
  },
  quantity: {
    label: "수확량",
    what: "값보다 수확량이 해마다 크게 달라집니다.",
    moves: [
      "농작물재해보험 가입 여부와 보장 범위 확인하기",
      "시설 보강·환경제어로 작황 편차 줄이기",
      "품종·작형을 나눠 한 번에 전부 실패하지 않게 하기",
    ],
  },
  cost: {
    label: "경영비",
    what: "매출보다 비용 쪽 변동이 소득을 흔듭니다.",
    moves: [
      "난방·전기 등 에너지 계약 조건 점검하기",
      "자재·종묘 구매를 공동구매로 묶기",
      "고정비 비중을 낮춰 나쁜 해의 타격 줄이기",
    ],
  },
};

/**
 * σ 는 "얼마나 흔들리나"만 말한다. 여기서는 "왜 흔들리나"를 말한다.
 * 원인이 다르면 처방이 다르기 때문에, 위험 수치보다 실행에 가까운 정보다.
 */
export default function RiskDriver({
  factors,
  cropName,
}: {
  factors: Factors;
  cropName: string;
}) {
  const p = PRESCRIPTION[factors.driver] ?? PRESCRIPTION.price;
  const bars = [
    { key: "가격", value: factors.share_price, color: "bg-signal-danger" },
    { key: "수확량", value: factors.share_quantity, color: "bg-signal-warn" },
    { key: "경영비", value: factors.share_cost, color: "bg-signal-calm" },
  ];
  const scale = Math.max(1, ...bars.map((b) => Math.abs(b.value)));

  return (
    <section className="rounded-xl border border-ink-800 bg-ink-900 p-5">
      <p className="text-xs leading-relaxed text-slate-500">
        {cropName}의 {factors.years[0]}~{factors.years[1]}년 {factors.n}개년 실적을
        가격·수확량·경영비로 분해했습니다.
      </p>

      <div className="mt-4 space-y-2.5">
        {bars.map((b) => {
          const width = (Math.abs(b.value) / scale) * 100;
          const negative = b.value < 0;
          return (
            <div key={b.key} className="grid grid-cols-[3.5rem_1fr_3.5rem] items-center gap-3">
              <span className="text-xs text-slate-400">{b.key}</span>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-ink-800">
                <div
                  className={`h-full rounded-full ${b.color} ${negative ? "opacity-40" : ""}`}
                  style={{ width: `${width}%` }}
                />
              </div>
              <span
                className={`tabular text-right text-xs ${
                  negative ? "text-slate-500" : "text-slate-300"
                }`}
              >
                {(b.value * 100).toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
        음수는 그 요인이 소득 변동을 <b>완충</b>했다는 뜻입니다 — 나쁜 해에 비용도 함께
        줄어드는 경우입니다. 합계가 100%를 넘는 것은 영업레버리지 때문입니다: 매출이
        1% 흔들리면 소득은 그보다 크게 흔들립니다.
      </p>

      <div className="mt-4 rounded-lg border border-ink-700 bg-ink-950/50 p-4">
        <div className="text-xs font-semibold text-signal-warn">
          주원인: {p.label}
        </div>
        <p className="mt-1 text-sm leading-relaxed text-slate-300">{p.what}</p>
        <ul className="mt-2 space-y-1 text-sm text-slate-400">
          {p.moves.map((m) => (
            <li key={m}>· {m}</li>
          ))}
        </ul>
      </div>

      {factors.correlation < -0.15 && (
        <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
          가격과 수확량의 상관은 {factors.correlation.toFixed(2)}입니다. 풍년이면 값이
          떨어져 서로 일부 상쇄되는데, 그만큼 소득 변동은 가격 변동보다 작아집니다.
        </p>
      )}
    </section>
  );
}
