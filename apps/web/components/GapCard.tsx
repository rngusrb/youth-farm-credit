import { won } from "@/lib/format";

type Props = {
  available: number;
  recommended: number;
  gap: number;
  targetDscr: number;
};

/** 격차 카드 — 신청 가능 한도 vs 권장 한도. 결과 화면에서 가장 크게. */
export default function GapCard({ available, recommended, gap, targetDscr }: Props) {
  const share = available > 0 ? Math.max(0, Math.min(recommended / available, 1)) : 0;
  return (
    <section className="rounded-2xl border border-paper-rule bg-paper-sunk p-6 sm:p-8">
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <div className="text-xs uppercase tracking-wider text-paper-ink3">
            제도상 신청 가능
          </div>
          <div className="tabular mt-1 text-3xl font-semibold text-paper-ink3 line-through decoration-paper-danger/60 decoration-2 sm:text-4xl">
            {won(available)}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-paper-accent">
            감당 가능한 차입 (DSCR {targetDscr.toFixed(2)})
          </div>
          <div className="tabular mt-1 text-4xl font-bold text-paper-ink sm:text-5xl">
            {won(recommended)}
          </div>
        </div>
      </div>

      <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-paper-rule">
        <div
          className="h-full rounded-full bg-paper-accent"
          style={{ width: `${share * 100}%` }}
        />
      </div>

      {gap > 0 && (
        <p className="mt-4 text-sm text-paper-ink2">
          격차{" "}
          <span className="tabular font-semibold text-paper-danger">{won(gap)}</span>
          {" — "}
          빌릴 수는 있지만 이 조건에서는 갚기 어려운 구간입니다.
        </p>
      )}
      {gap <= 0 && (
        <p className="mt-4 text-sm text-paper-ink2">
          제도 한도까지 차입해도 목표 상환능력을 유지할 수 있는 조건입니다.
        </p>
      )}
    </section>
  );
}
