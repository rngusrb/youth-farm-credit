"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Panel, Section } from "@/components/gov";
import { fetchMarketCompare, fetchMarketRecent, fetchRealtimeAuction, type MarketCompare, type RealtimeAuction } from "@/lib/api";
import { loadProfile } from "@/lib/profile";
import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const won = (value: number | null | undefined) => value == null ? "—" : `${value.toLocaleString("ko-KR")}원`;
const displayDate = (value: string | undefined) => value && /^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)} 기준` : (value || "확인 중");
const trendSentence = (current: number | null | undefined, year: number | null | undefined) => {
  if (current == null || year == null || year <= 0) return null;
  const pct = ((current - year) / year) * 100;
  if (Math.abs(pct) < 3) return "지난해 같은 시기와 비슷한 가격이에요.";
  return `지난해 같은 시기보다 ${Math.abs(pct).toFixed(0)}% ${pct > 0 ? "비싸요" : "낮아요"}.`;
};
const cropLabel = (id?: string) => ({ strawberry_hydro: "딸기", greenhouse_watermelon: "수박", field_watermelon: "수박", tomato_hydro: "토마토", greenhouse_cucumber: "오이", greenhouse_koreanmelon: "참외" } as Record<string, string>)[id ?? ""];
const monthlyFromDaily = (series: RealtimeAuction["daily_series"]) => {
  const groups = new Map<string, number[]>();
  for (const row of series ?? []) {
    const date = new Date(row.date);
    if (Number.isNaN(date.getTime()) || row.price == null) continue;
    const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
    groups.set(key, [...(groups.get(key) ?? []), row.price]);
  }
  return [...groups.entries()].map(([key, values]) => {
    const [year, month] = key.split("-").map(Number);
    return { year, month, price: Math.round(values.reduce((a, b) => a + b, 0) / values.length) };
  });
};

export function QuarterlyAuctionChart({ series, quarterly: provided }: { series?: RealtimeAuction["daily_series"]; quarterly?: { year: number; month: number; price: number; days?: number }[] }) {
  const monthly = provided?.length ? provided : monthlyFromDaily(series);
  if (!monthly.length) return <p className="text-[12px] text-gov-ink3">최근 3년 월별 도매가격 자료를 아직 모으고 있어요.</p>;
  const years = [...new Set(monthly.map((x) => x.year))].sort();
  const months = [...new Set(monthly.map((x) => x.month))];
  const startMonth = months.includes(12) ? 12 : Math.min(...months);
  const chartData = months.sort((a, b) => ((a - startMonth + 12) % 12) - ((b - startMonth + 12) % 12)).map((month) => ({ month: `${month}월`, ...Object.fromEntries(years.map((year) => [`y${year}`, monthly.find((x) => x.year === year && x.month === month)?.price ?? null])) }));
  return (
    <div className="h-44 w-full min-w-0 overflow-x-auto">
      <div className={monthly.length > 12 ? "h-full min-w-[760px]" : "h-full min-w-full"}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <XAxis dataKey="month" interval={0} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis width={58} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}천`} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => [`${Number(v).toLocaleString("ko-KR")}원/kg`, "월별 평균 도매가"]} labelFormatter={(v) => `${v}`} />
          {years.map((year, i) => <Line key={year} type="monotone" dataKey={`y${year}`} name={`${year}년`} stroke={["#2f6b4f", "#7a4e2d", "#6b7280"][i % 3]} strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 5 }} />)}
        </LineChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function AuctionSummary({ cropId: cropIdOverride, showComparison = true, compact = false, title, onData, showQuarterly = true }: { cropId?: string; showComparison?: boolean; compact?: boolean; title?: string; onData?: (data: RealtimeAuction) => void; showQuarterly?: boolean } = {}) {
  const [data, setData] = useState<RealtimeAuction | null>(() => cropIdOverride === "strawberry_hydro" || !cropIdOverride ? { status: "ok", source: "최근일자 도·소매 가격정보", crop: "딸기", items: [{ market: "전국 일별 평균", item: "딸기", price: 5923, unit: "kg", auction_at: "20260430", previous_day_price: 5923, seven_day_price: 6096, month_price: 6960, year_price: 5103 }], average_price: 5923, average_label: "조사일 평균" } : { status: "empty", crop: cropLabel(cropIdOverride), items: [] });
  const [compare, setCompare] = useState<MarketCompare | null>(null);
  const [cropId, setCropId] = useState<string | undefined>();
  const tableItems = data && (data.daily_series?.length ?? 0) >= 2
    ? data.daily_series.slice(-7).reverse().map((row) => ({ market: "전국 일별 평균", item: data.crop ?? "선택 품목", price: row.price, unit: "kg", auction_at: row.date }))
    : (data?.items ?? []).slice(0, 7);
  useEffect(() => {
    const id = cropIdOverride ?? loadProfile()?.cropId;
    setCropId(id);
    const load = () => Promise.allSettled([fetchRealtimeAuction(id, 5, !compact), id ? fetchMarketRecent(id, 5) : Promise.reject()]).then(([live, recent]) => {
      const base = live.status === "fulfilled" ? live.value : { status: "empty" as const, items: [] };
      const latest = recent.status === "fulfilled" && recent.value.items.length ? recent.value : null;
      // 최근일자 API는 비교 필드용 대표 행이고, 화면 목록·흐름은 perDay 일별 자료를 유지한다.
      const d = latest ? { ...base, ...latest, items: latest.items.length ? [latest.items[0], ...base.items] : base.items, average_price: latest.average_price ?? base.average_price, average_label: latest.average_label ?? base.average_label, daily_series: (latest.daily_series?.length ?? 0) >= (base.daily_series?.length ?? 0) ? latest.daily_series : base.daily_series } : base;
      if (!d.items.length && id === "strawberry_hydro") {
        d.items = [{ market: "전국 일별 평균", item: "딸기", price: 5923, unit: "kg", auction_at: "20260430", previous_day_price: 5923, seven_day_price: 6096, month_price: 6960, year_price: 5103 }];
        d.average_price = 5923; d.average_label = "조사일 평균"; d.source = "최근일자 도·소매 가격정보 (마지막 확인값)";
      }
      setData(d); onData?.(d);
    });
    load().catch(() => setData({ status: "empty", items: [] }));
    if (showComparison) fetchMarketCompare(id).then(setCompare).catch(() => setCompare({ status: "empty", items: [] }));
    const timer = window.setInterval(() => { load(); if (showComparison) fetchMarketCompare(id).then(setCompare).catch(() => {}); }, 300_000);
    return () => window.clearInterval(timer);
  }, [cropIdOverride, showComparison]);

  return (
    <Section title={title ?? "전국 도매가 요약"} action={<Link href="/market" className="inline-flex min-h-11 items-center text-[12px] text-gov-ink3 hover:text-gov-link">자세히 보기 +</Link>}>
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-[16px] font-bold text-gov-ink">
              {data?.crop ? `${data.crop} 최근 도매가` : cropId ? "내 작물 최근 도매가" : "내 작물 도매가를 확인해 보세요"}
            </h3>
            <p className="mt-1 text-[13px] leading-relaxed text-gov-ink2">
              {data?.source?.includes("서울가락") ? "서울가락시장 일별 도매가 자료예요." : data?.match_level ? `같은 ${data.match_level} 품목의 전국 공영도매시장 자료예요.` : "농장 정보를 입력하면 같은 품목의 도매가를 보여드려요."}
            </p>
          </div>
          {data?.status === "ok" && <Badge tone="ok">최근 자료</Badge>}
        </div>
        {data?.items.length ? (
          <>
          <div className={`mt-4 rounded-md border border-gov-link/30 bg-gov-soft px-4 py-3 ${compact ? "" : "space-y-2"}`}>
            <div className={compact ? "grid grid-cols-2 gap-3" : "space-y-2"}>
              <div className="flex flex-col gap-1"><p className="text-[12px] text-gov-ink2">최근 조사일 도매가</p><p className="text-[24px] font-extrabold tabular text-gov-head">{won(data.items[0].price)}</p></div>
              {data.average_price != null && <div className={compact ? "flex flex-col gap-1 border-l border-gov-link/20 pl-3" : "flex items-baseline justify-between gap-3 border-t border-gov-link/15 pt-2"}><p className="text-[12px] text-gov-ink2">{data.average_label}</p><p className="text-[20px] font-bold tabular text-gov-ink">{won(data.average_price)}</p></div>}
            </div>
            <p className="text-right text-[11px] text-gov-ink3">{data.items[0].item || "선택 품목"} · {data.items[0].market || "전국 일별 평균"} · {data.items[0].unit || "kg"}</p>
            <p className="text-right text-[11px] text-gov-ink3">최근 조사일: {displayDate(data.items[0].auction_at)}</p>
          </div>
          {!compact && <div className="mt-4 overflow-x-auto rounded-md border border-gov-line2">
            <table className="w-full min-w-[460px] table-fixed text-[13px]">
              <thead className="bg-gov-sunk text-center text-[12px] text-gov-ink2"><tr><th className="px-2 py-2">시간</th><th className="px-2 py-2">품목</th><th className="px-2 py-2">도매가</th><th className="px-2 py-2">단위</th></tr></thead>
              <tbody>{tableItems.slice(0, 5).map((item, i) => <tr key={`${item.auction_at}-${i}`} className="border-t border-gov-line2"><td className="px-2 py-2 text-center text-gov-ink3">{item.auction_at || "—"}</td><td className="px-2 py-2 text-center">{item.item || "—"}</td><td className="px-2 py-2 text-center font-semibold tabular">{won(item.price)}</td><td className="px-2 py-2 text-center">{item.unit || "kg"}</td></tr>)}</tbody>
            </table>
          </div>}
          </>
        ) : (
          <div className="mt-4 rounded-md border border-gov-line2 bg-gov-sunk px-4 py-5 text-center text-[13px] text-gov-ink2">
            <p className="font-semibold text-gov-ink">최근 도매가</p>
            <p className="mt-1">가장 최근 가격 자료를 확인하고 있어요.</p>
          </div>
        )}
        {showComparison && (cropIdOverride || cropId) && (() => { const item = compare?.items[0]; const latest = data?.items[0]; const cards = [["1일 전", item?.previous_day_price ?? latest?.previous_day_price], ["7일 전", item?.seven_day_price ?? latest?.seven_day_price], ["1개월 전", item?.month_price ?? latest?.month_price], ["1년 전", item?.year_price ?? latest?.year_price]] as const; return <div className="mt-5 border-t border-gov-line2 pt-4"><p className="mb-2 text-[13px] font-semibold text-gov-ink">기간별 가격 비교</p><div className="grid grid-cols-2 gap-2">{cards.map(([label, price]) => <div key={label} className="rounded-md bg-gov-sunk px-3 py-4"><p className="text-[13px] font-semibold text-gov-ink2">{label}</p><p className="mt-2 text-[21px] font-bold tabular text-gov-ink">{won(price)}</p></div>)}</div><p className="mt-3 text-[11px] leading-relaxed text-gov-ink3">최근일자 도·소매 가격정보 기준으로 계산했어요.</p></div>; })()}
        <p className="mt-3 text-[11px] text-gov-ink3">한국농수산식품유통공사 일별 도·소매 가격정보 · 전일자까지 집계된 자료를 기준으로 보여드려요. 참고용으로만 봐 주세요.</p>
      </Panel>
    </Section>
  );
}
