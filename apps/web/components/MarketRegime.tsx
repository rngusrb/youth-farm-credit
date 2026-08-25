import type { Diagnosis } from "@/lib/api";

type Market = NonNullable<Diagnosis["market"]>;

const REGIME = {
  calm: { label: "평소보다 조용함", tone: "text-signal-ok" },
  normal: { label: "평소 수준", tone: "text-slate-300" },
  turbulent: { label: "평소보다 불안함", tone: "text-signal-danger" },
} as const;

/**
 * KAMIS 도매가로 잰 두 가지 — 교차검증과 현재 국면.
 * 국면은 명시적으로 한도에 반영하지 않는다. 시장이 조용하다고 더 빌리라고
 * 부추기면, 이 서비스가 막으려던 바로 그 일을 하게 된다.
 */
export default function MarketRegime({ market }: { market: Market }) {
  const g = market.garch;
  const r = REGIME[g.regime];
  const cross =
    market.annual_price_sigma !== null && market.kosis_price_sigma !== null
      ? Math.abs(market.annual_price_sigma - market.kosis_price_sigma)
      : null;

  return (
    <section className="rounded-xl border border-ink-800 bg-ink-900 p-5">
      <h3 className="text-sm font-semibold text-slate-200">도매시장 교차검증</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        소득조사와 완전히 다른 자료인 KAMIS 도매가격{" "}
        <span className="tabular">{market.trading_days.toLocaleString("ko-KR")}</span>
        거래일로 같은 값을 다시 재봤습니다.
      </p>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-ink-800 bg-ink-950/50 p-3">
          <dt className="text-[11px] text-slate-500">도매가 연평균 변동성</dt>
          <dd className="tabular mt-0.5 text-lg font-semibold text-slate-200">
            {market.annual_price_sigma?.toFixed(3) ?? "—"}
          </dd>
        </div>
        <div className="rounded-lg border border-ink-800 bg-ink-950/50 p-3">
          <dt className="text-[11px] text-slate-500">소득조사 농가수취가 변동성</dt>
          <dd className="tabular mt-0.5 text-lg font-semibold text-slate-200">
            {market.kosis_price_sigma?.toFixed(3) ?? "—"}
          </dd>
        </div>
        <div className="rounded-lg border border-ink-800 bg-ink-950/50 p-3">
          <dt className="text-[11px] text-slate-500">현재 시장 국면</dt>
          <dd className={`mt-0.5 text-lg font-semibold ${r.tone}`}>{r.label}</dd>
        </div>
      </dl>

      {cross !== null && (
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          {cross < 0.03 ? (
            <>
              두 기관의 서로 다른 조사가{" "}
              <span className="text-signal-ok">사실상 같은 값</span>을 가리킵니다
              (차이 {cross.toFixed(3)}). 변동성 추정이 독립적으로 뒷받침됩니다.
            </>
          ) : (
            <>
              두 값의 차이는 {cross.toFixed(3)}입니다. 도매시장 시세와 농가가 실제로
              받는 값은 유통 단계와 품종 구성이 달라 완전히 일치하지는 않습니다.
            </>
          )}
        </p>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
        가격 충격이 절반으로 잦아드는 데 약{" "}
        <span className="tabular">{g.half_life_days}</span>일 걸립니다 (지속성{" "}
        {g.persistence.toFixed(2)}). 현재 변동성은 장기 평균의{" "}
        <span className="tabular">{g.current_over_longrun.toFixed(2)}</span>배입니다.
        <b className="text-slate-500"> 시장 국면은 한도 계산에 반영하지 않습니다</b> —
        25년 상환에 본질적인 것은 장기 평균이고, 조용한 시기라고 더 빌려도 된다는 뜻은
        아니기 때문입니다.
      </p>
    </section>
  );
}
