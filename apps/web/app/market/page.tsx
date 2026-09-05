"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Crumb, Empty, Notice, Page, PageTitle, Panel, Section, Stat } from "@/components/gov";
import { fetchCrop, fetchCrops, fetchMarketQuarterly, fetchMarketVolume, type CropDetail, type CropRow, type RealtimeAuction, type QuarterlyMarket, type MarketCategory } from "@/lib/api";
import AuctionSummary, { QuarterlyAuctionChart } from "@/components/AuctionSummary";
import Fold from "@/components/Fold";
import { CSV_MARKET_CATEGORIES } from "@/lib/productCategories";
import { RECENT_PRICE_CATEGORIES } from "@/lib/recentPriceCategories";
import { loadProfile } from "@/lib/profile";

const REGIME: Record<string, { label: string; tone: "ok" | "plain" | "warn" }> = {
  calm: { label: "가격 변화가 작아요", tone: "ok" },
  normal: { label: "평상 수준", tone: "plain" },
  turbulent: { label: "가격 변화가 커요", tone: "warn" },
};

function Body() {
  const params = useSearchParams();
  const [rows, setRows] = useState<CropRow[]>([]);
  const [categories, setCategories] = useState<MarketCategory[]>(RECENT_PRICE_CATEGORIES);
  const [id, setId] = useState("strawberry_hydro");
  const [largeCode, setLargeCode] = useState("");
  const [middleCode, setMiddleCode] = useState("");
  const [detail, setDetail] = useState<CropDetail | null>(null);
  const [auction, setAuction] = useState<RealtimeAuction | null>(null);
  const [quarterly, setQuarterly] = useState<QuarterlyMarket["items"]>([]);
  const [volume, setVolume] = useState<{ year: number; month: number; quantity: number }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCrops().then((d) => {
        setRows(d.crops);
        const available = RECENT_PRICE_CATEGORIES;
        setCategories(available);
        const wanted = params.get("crop") ?? loadProfile()?.cropId ?? "strawberry_hydro";
        const withMarket = d.crops.find((c) => c.has_market);
        const initial = d.crops.find((c) => c.id === wanted) ?? withMarket ?? d.crops[0];
        const category = available.find((x) => x.large_code === initial?.price_category_code);
        const middle = available.find((x) => x.middle_code === initial?.price_item_code);
        setId(initial?.id ?? ""); setLargeCode(category?.large_code ?? ""); setMiddleCode(middle?.middle_code ?? "");
      })
      .catch(() => setError("작목 목록을 불러오지 못했어요."));
  }, [params]);

  useEffect(() => {
    if (!id) return;
    fetchCrop(id).then(setDetail).catch(() => setError("작목 정보를 불러오지 못했어요."));
    fetchMarketQuarterly(id).then((d) => setQuarterly(d.items)).catch(() => setQuarterly([]));
    fetchMarketVolume(id).then((d) => setVolume(d.items)).catch(() => setVolume([]));
  }, [id]);

  const m = detail?.market;
  const g = m?.garch;
  const categoryRows = categories.length ? categories : RECENT_PRICE_CATEGORIES;
  const largeGroups = Array.from(new Map(categoryRows.map((c) => [c.large_code, c.large_name])).entries());
  const middleGroups = categoryRows.filter((c) => Number(c.large_code) === Number(largeCode));

  return (
    <>
      {error && <Notice tone="danger">{error}</Notice>}

      <Panel className="mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="crop" className="text-[13px] font-semibold text-gov-ink2">작목 선택</label>
          <select aria-label="작물 대분류" value={largeCode} onChange={(e) => { setLargeCode(e.target.value); setMiddleCode(""); setId(""); }}
                  className="min-h-11 rounded-md border border-gov-line px-3 text-[13px] outline-none focus:border-gov-link">
            <option value="">대분류를 선택하세요</option>{largeGroups.map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}
          </select>
          <select id="crop" value={middleCode} disabled={!largeCode} onChange={(e) => { const code = e.target.value; setMiddleCode(code); const selected = middleGroups.find((x) => x.middle_code === code); const found = rows.find((c) => c.price_item_code === code || (!!selected && c.name.includes(selected.middle_name))); setId(found?.id ?? ""); }} className="min-h-11 rounded-md border border-gov-line px-3 text-[13px] outline-none focus:border-gov-link">
            <option value="">중분류를 선택하세요</option>{middleGroups.map((c) => <option key={`${c.large_code}-${c.middle_code}`} value={c.middle_code}>{c.middle_name} ({c.middle_code})</option>)}
          </select>
          <span className="text-[12px] text-gov-ink3">
            도매가 시계열 보유 {rows.filter((c) => c.has_market).length}종 / 전체 {rows.length}종
          </span>
        </div>
      </Panel>

      {id && <AuctionSummary cropId={id} showComparison showQuarterly={false} onData={setAuction} />}

      {detail && !m && (
        <Empty
          title={`${detail.name}은 도매가 시계열을 아직 수집하지 않았어요`}
          body="KAMIS 품목 매핑이 있는 작목부터 순차로 수집해요. 소득이 흔들리는 정도은 KOSIS 소득조사 실측값을 쓰므로 진단 결과에는 영향이 없어요."
        />
      )}

      {detail && m && g && (
        <>
          <Section title="요즘 가격 흐름">
            <Panel>
              {m.quote_is_carried && (
                <div className="mb-4">
                  <Notice tone="warn" title="요즘 가격 흐름은 아직 판단하기 어려워요">
                    이 품목은 가격이 실제로 움직인 날이{" "}
                    {m.price_movement_ratio != null
                      ? `${Math.round(m.price_movement_ratio * 100)}%`
                      : "기준치 미만"}
                    뿐이에요. 거래가 없는 날 직전 시세가 이월되기 때문에, 조용해 보이는
                    것이 시장이 아니라 집계 방식일 수 있어요. 모르는 것을 ‘평상’이라고
                    말하지 않아요.
                  </Notice>
                </div>
              )}
              <h3 className="mb-2 text-[15px] font-bold text-gov-ink">1. 최근 3년 월별 평균 가격 비교</h3>
              <QuarterlyAuctionChart quarterly={quarterly} series={auction?.daily_series} />
              <p className="mb-4 text-[13px] leading-relaxed text-gov-ink2">1월부터 12월까지 같은 달의 가격을 최근 3개 연도 선으로 비교해요.</p>
              <h3 className="mb-2 text-[15px] font-bold text-gov-ink">2. 가격 변동성</h3>
              <Fold tone="gov" open={false} summary="지금 가격이 얼마나 오르내리는지 보기" hint="보조 지표">
              <div className="grid gap-6 sm:grid-cols-2">
                <Stat label={detail.name}
                      value={g.regime ? (REGIME[g.regime]?.label ?? g.regime) : "판정 보류"}
                      tone={g.regime
                        ? (REGIME[g.regime]?.tone === "warn" ? "warn" : REGIME[g.regime]?.tone === "ok" ? "ok" : "plain")
                        : "warn"}
                      note={g.regime
                        ? `현재 변동성이 장기 평균의 ${g.current_over_longrun.toFixed(2)}배`
                        : "이월 시세가 많아 판정할 수 없어요"} />
                <Stat label="가격 변화가 가라앉는 시간" value={g.half_life_days.toFixed(1)} unit="일"
                      note="가격이 크게 바뀐 뒤 평소 수준으로 돌아오는 데 걸리는 시간" />
              </div>
              <div className="mt-5 rounded-lg border border-gov-line2 bg-gov-sunk/50 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-[13px] font-bold text-gov-ink">지금 가격 변화의 위치</h3>
                  <span className="text-[11px] text-gov-ink3">최근 오르내림 ÷ 평소 오르내림</span>
                </div>
                <div className="relative mt-4 h-20 px-1">
                  <div className="flex h-14 items-end gap-1" aria-hidden>
                    {[18, 27, 39, 54, 69, 82, 92, 86, 72, 56, 42, 30, 21].map((height, i) => (
                      <div key={i} className="flex-1 rounded-t-sm bg-gov-link/25" style={{ height: `${height}%` }} />
                    ))}
                  </div>
                  <div
                    className="absolute bottom-5 top-0 w-0.5 bg-gov-warn"
                    style={{ left: `${Math.min(96, Math.max(4, (g.current_over_longrun / 2) * 100))}%` }}
                    aria-label={`현재 위치 ${g.current_over_longrun.toFixed(2)}배`}
                  />
                  <div className="absolute bottom-0 left-0 text-[10px] text-gov-ink3">변화 작음</div>
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[10px] text-gov-ink3">평소</div>
                  <div className="absolute bottom-0 right-0 text-[10px] text-gov-ink3">변화 큼</div>
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-gov-ink2">
                  지금 가격은 평소보다 <b className="tabular text-gov-ink">{g.current_over_longrun.toFixed(2)}배</b> 크게 오르내리고 있어요.
                  가격이 비싼지 싼지가 아니라, 최근 변화가 얼마나 큰지를 보여줘요.
                </p>
              </div>
              <div className="mt-4 rounded-lg border border-gov-line2 bg-white p-4">
                <h3 className="mb-2 text-[13px] font-bold text-gov-ink">비교 검증 자료</h3>
                <p className="mb-2 text-[12px] text-gov-ink3">서로 다른 기관의 가격 자료가 비슷한 방향을 가리키는지 확인해요.</p>
                <div className="grid grid-cols-3 gap-2 text-center text-[12px]"><div className="rounded bg-gov-sunk px-2 py-2"><b>KAMIS</b><br />{m.annual_price_sigma?.toFixed(3) ?? "—"}</div><div className="rounded bg-gov-sunk px-2 py-2"><b>KOSIS</b><br />{m.kosis_price_sigma?.toFixed(3) ?? "—"}</div><div className="rounded bg-gov-sunk px-2 py-2"><b>차이</b><br />{m.annual_price_sigma != null && m.kosis_price_sigma != null ? Math.abs(m.annual_price_sigma - m.kosis_price_sigma).toFixed(3) : "—"}</div></div>
              </div>
              </Fold>
              <div className="mt-4">
                <Notice tone="info" title="가격 그래프는 참고용이에요">
                  최근 가격이 평균보다 높은지 낮은지, 그리고 앞으로 오르내리는 방향을 살펴보는 자료예요.
                </Notice>
              </div>
              <div className="mt-4 rounded-lg border border-gov-link/30 bg-gov-soft px-4 py-4">
                <h3 className="mb-2 text-[13px] font-bold text-gov-head">비교 지표</h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-[12px]">
                    <tbody>
                      <tr className="border-b border-gov-link/15"><th className="w-1/3 py-2 text-left font-semibold text-gov-ink2">분석 기간</th><td className="py-2 text-gov-ink2">{m.window?.join(" ~ ") ?? "—"} · {m.trading_days.toLocaleString("ko-KR")}거래일</td></tr>
                      <tr className="border-b border-gov-link/15"><th className="py-2 text-left font-semibold text-gov-ink2">가격 자료</th><td className="py-2 text-gov-ink2">한국농수산식품유통공사 일별 도·소매 가격정보 (perDay)</td></tr>
                      <tr><th className="py-2 text-left font-semibold text-gov-ink2">수확기</th><td className="py-2 text-gov-ink2">{detail.harvest_months.length ? `${detail.harvest_months.join("·")}월` : "자료 없음"}</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="mt-5 border-t border-gov-line2 pt-5">
                <h3 className="mb-2 text-[15px] font-bold text-gov-ink">3. 출하량</h3>
                <p className="mb-3 text-[13px] leading-relaxed text-gov-ink2">정산된 출하량이 많은 달은 색을 진하게 표시해요. 출하가 몰리는 시기를 한눈에 볼 수 있어요.</p>
                <div className="grid grid-cols-6 gap-2 sm:grid-cols-12">{Array.from({ length: 12 }, (_, i) => { const month = i + 1; const amount = volume.filter((x) => x.month === month).reduce((s, x) => s + x.quantity, 0); const max = Math.max(...Array.from({ length: 12 }, (_, m) => volume.filter((x) => x.month === m + 1).reduce((s, x) => s + x.quantity, 0)), 1); const ratio = amount / max; const opacity = amount ? (ratio > 0.75 ? 1 : ratio > 0.5 ? 0.75 : ratio > 0.25 ? 0.5 : 0.25) : 0.1; return <div key={month} className="text-center"><div className="h-10 rounded-sm bg-gov-link" style={{ opacity }} /><div className="mt-1 text-[10px] text-gov-ink3">{month}월</div></div>; })}</div>
                <p className="mt-3 text-[11px] text-gov-ink3">전국 공영도매시장 katOrigin `qty(물량)` 2025년 월평균 기준 · 출하량 색상은 4단계예요.</p>
              </div>
            </Panel>
          </Section>

        </>
      )}
    </>
  );
}

export default function MarketPage() {
  return (
    <Page>
      <Crumb trail={[{ label: "데이터" }, { label: "가격과 시장 흐름" }]} />
      <PageTitle
        title="가격과 시장 흐름"
        lead="농산물 도매가격이 평소보다 얼마나 오르내리는지 살펴봐요. 가격 변화가 큰 시기인지 확인할 수 있어요."
      />
      <div id="main">
        <Suspense fallback={<p className="text-[14px] text-gov-ink2">불러오는 중…</p>}>
          <Body />
        </Suspense>
      </div>
    </Page>
  );
}
