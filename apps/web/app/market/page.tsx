"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/shell/PageHeader";
import Disclaimer from "@/components/shell/Disclaimer";
import { Card, CardTitle, Empty, Page, Pill, Stat } from "@/components/ui";
import { fetchCrop, fetchCrops, type CropDetail, type CropRow } from "@/lib/api";
import { loadProfile } from "@/lib/profile";

const REGIME: Record<string, { label: string; tone: "ok" | "plain" | "warn" }> = {
  calm: { label: "평소보다 조용함", tone: "ok" },
  normal: { label: "평상 수준", tone: "plain" },
  turbulent: { label: "평소보다 요동침", tone: "warn" },
};
const MONTHS = ["1","2","3","4","5","6","7","8","9","10","11","12"];

function MarketBody() {
  const params = useSearchParams();
  const [rows, setRows] = useState<CropRow[]>([]);
  const [id, setId] = useState("");
  const [detail, setDetail] = useState<CropDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCrops()
      .then((d) => {
        setRows(d.crops);
        const wanted = params.get("crop") ?? loadProfile()?.cropId;
        const withMarket = d.crops.find((c) => c.has_market);
        setId(
          (wanted && d.crops.some((c) => c.id === wanted) ? wanted : null) ??
            withMarket?.id ??
            d.crops[0]?.id ??
            "",
        );
      })
      .catch(() => setError("백엔드에 연결하지 못했습니다."));
  }, [params]);

  useEffect(() => {
    if (!id) return;
    fetchCrop(id).then(setDetail).catch(() => setError("작목 정보를 불러오지 못했습니다."));
  }, [id]);

  const m = detail?.market;
  const g = m?.garch;

  return (
    <>
      {error && (
        <div className="mb-5 rounded-lg border border-signal-danger/40 bg-signal-danger/10 px-4 py-3 text-sm text-signal-danger">
          {error}
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <select
          value={id}
          onChange={(e) => setId(e.target.value)}
          className="rounded-lg border border-ink-700 bg-ink-900 px-3.5 py-2.5 text-sm outline-none focus:border-signal-warn"
        >
          {rows.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}{c.has_market ? " · 도매가 수집됨" : ""}
            </option>
          ))}
        </select>
        <span className="text-[11px] text-slate-600">
          도매가 시계열이 있는 작목 {rows.filter((c) => c.has_market).length}종 / 전체 {rows.length}종
        </span>
      </div>

      {detail && !m && (
        <Empty
          title={`${detail.name}은 도매가 시계열을 아직 수집하지 않았습니다`}
          body="KAMIS 품목 매핑이 있는 작목부터 순차로 수집합니다. σ 자체는 KOSIS 소득조사에서 실측한 값을 쓰므로 진단에는 영향이 없습니다."
        />
      )}

      {detail && m && g && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardTitle>현재 국면</CardTitle>
            <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
              <Stat
                label={detail.name}
                value={REGIME[g.regime]?.label ?? g.regime}
                tone={REGIME[g.regime]?.tone === "warn" ? "warn" : REGIME[g.regime]?.tone === "ok" ? "ok" : "plain"}
                note={`현재 변동성이 장기 평균의 ${g.current_over_longrun.toFixed(2)}배`}
              />
              <Stat label="충격 반감기" value={g.half_life_days.toFixed(1)} unit="일"
                    note={`지속성 ${g.persistence.toFixed(2)} — 가격 충격이 가라앉는 속도`} />
              <Stat label="관측" value={m.trading_days.toLocaleString("ko-KR")} unit="거래일" />
            </div>
            <p className="mt-4 rounded-lg border border-ink-800 bg-ink-950/50 px-3.5 py-3 text-xs leading-relaxed text-slate-500">
              <b className="text-slate-400">이 국면은 한도 계산에 반영하지 않습니다.</b> 25년 상환에
              본질적인 것은 장기 평균이고, 조용한 시기라고 더 빌려도 된다는 뜻이 아니기 때문입니다.
              여기 있는 값은 지금 시장이 어떤 상태인지 알려 주는 참고 지표입니다.
            </p>
          </Card>

          <Card>
            <CardTitle>교차검증</CardTitle>
            <p className="mb-3 text-xs leading-relaxed text-slate-500">
              소득조사와 완전히 다른 자료로 같은 값을 다시 재봅니다. 두 기관의 조사가 비슷한 값을
              가리키면 변동성 추정이 독립적으로 뒷받침됩니다.
            </p>
            <dl className="space-y-2.5 text-sm">
              <div className="flex items-baseline justify-between">
                <dt className="text-slate-500">KAMIS 도매가 σ</dt>
                <dd className="tabular font-medium">{m.annual_price_sigma?.toFixed(3) ?? "—"}</dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="text-slate-500">KOSIS 농가수취가 σ</dt>
                <dd className="tabular font-medium">{m.kosis_price_sigma?.toFixed(3) ?? "—"}</dd>
              </div>
              {m.annual_price_sigma != null && m.kosis_price_sigma != null && (
                <div className="flex items-baseline justify-between border-t border-ink-800 pt-2.5">
                  <dt className="text-slate-500">차이</dt>
                  <dd className="tabular font-medium">
                    {Math.abs(m.annual_price_sigma - m.kosis_price_sigma).toFixed(3)}
                  </dd>
                </div>
              )}
            </dl>
            <p className="mt-3 text-[10px] leading-relaxed text-slate-600">{m.source}</p>
          </Card>

          <Card className="lg:col-span-3">
            <CardTitle>수확기</CardTitle>
            <div className="flex gap-1">
              {MONTHS.map((mm, i) => {
                const on = detail.harvest_months.includes(i + 1);
                return (
                  <div key={mm} className="flex-1 text-center">
                    <div
                      className={`h-8 rounded ${on ? "bg-signal-warn/70" : "bg-ink-800"}`}
                      title={`${mm}월${on ? " 수확" : ""}`}
                    />
                    <div className={`mt-1 text-[10px] ${on ? "text-signal-warn" : "text-slate-600"}`}>
                      {mm}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
              출하가 몇 달에 몰릴수록 그 시점의 시세 하나에 한 해 소득이 걸립니다. 변동성 추정은
              수확기 밖의 가격 공백을 건너뛰고 계산합니다 — 그렇지 않으면 계절 공백이 급락으로
              잘못 잡힙니다.
            </p>
          </Card>
        </div>
      )}
    </>
  );
}

export default function MarketPage() {
  return (
    <Page>
      <PageHeader
        title="시세·국면"
        lead="KAMIS 일별 도매가에 GARCH(1,1)를 적합해 지금 시장이 평소보다 조용한지 요동치는지 봅니다."
      />
      <Suspense fallback={<p className="text-sm text-slate-500">불러오는 중…</p>}>
        <MarketBody />
      </Suspense>
      <Disclaimer />
    </Page>
  );
}
