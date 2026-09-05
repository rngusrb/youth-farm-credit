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
  if (!monthly.length) return <p className="text-[12px] text-gov-ink3">최근 3년 원천 가격 자료를 아직 모으고 있어요.</p>;
  const years = [...new Set(monthly.map((x) => x.year))].sort();
  const months = [...new Set(monthly.map((x) => x.month))];
  const startMonth = months.includes(12) ? 12 : Math.min(...months);
  const chartData = months.sort((a, b) => ((a - startMonth + 12) % 12) - ((b - startMonth + 12) % 12)).map((month) => ({ month: `${month}월`, ...Object.fromEntries(years.map((year) => [`y${year}`, monthly.find((x) => x.year === year && x.month === month)?.price ?? null])) }));
  return (
    <div className="h-44 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis width={58} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}천`} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => [`${Number(v).toLocaleString("ko-KR")}원`, "분기 평균 도매가"]} labelFormatter={(v) => `${v}`} />
          {years.map((year, i) => <Line key={year} type="monotone" dataKey={`y${year}`} name={`${year}년`} stroke={["#2f6b4f", "#7a4e2d", "#6b7280"][i % 3]} strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 5 }} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function AuctionSummary({ cropId: cropIdOverride, showComparison = true, compact = false, title, onData, showQuarterly = true }: { cropId?: string; showComparison?: boolean; compact?: boolean; title?: string; onData?: (data: RealtimeAuction) => void; showQuarterly?: boolean } = {}) {
  const [data, setData] = useState<RealtimeAuction | null>(null);
  const [compare, setCompare] = useState<MarketCompare | null>(null);
  const [cropId, setCropId] = useState<string | undefined>();
  useEffect(() => {
    const id = cropIdOverride ?? loadProfile()?.cropId;
    setCropId(id);
    const load = () => Promise.allSettled([fetchRealtimeAuction(id, 5, !compact), id ? fetchMarketRecent(id, 5) : Promise.reject()]).then(([live, recent]) => {
      const base = live.status === "fulfilled" ? live.value : { status: "empty" as const, items: [] };
      const latest = recent.status === "fulfilled" && recent.value.items.length ? recent.value : null;
      const d = latest ? { ...base, ...latest, daily_series: base.daily_series } : base;
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
            <p className="text-right text-[11px] text-gov-ink3">{data.items[0].item || "선택 품목"} · {data.items[0].market} · 상품(상) · {data.items[0].unit || "단위"}</p>
            <p className="text-right text-[11px] text-gov-ink3">최근 조사일: {displayDate(data.items[0].auction_at)}</p>
          </div>
          {showComparison && compare?.items[0] && (() => {
            const item = compare.items[0];
            const series = data.daily_series?.filter((x) => x.price != null) ?? [];
            const first = series[0]?.price;
            const last = series[series.length - 1]?.price;
            const dayTrend = first && last && Math.abs(last - first) / first >= 0.03
              ? `최근 30일은 가격이 ${last > first ? "오르는" : "내리는"} 흐름이에요.`
              : null;
            return (
              <div className="mt-3 rounded-md border border-gov-line2 bg-white px-3 py-2.5 text-[13px] text-gov-ink2">
                <span className="font-semibold text-gov-ink">한눈에 보기</span>
                <span className="ml-2">{trendSentence(item.price, item.year_price) ?? "전년 같은 시기와 비교할 자료를 확인 중이에요."}</span>
                {dayTrend && <span className="ml-2 text-gov-link">{dayTrend}</span>}
              </div>
            );
          })()}
          {!compact && <div className="mt-4 overflow-x-auto rounded-md border border-gov-line2">
            <table className="w-full min-w-[520px] text-[13px]">
              <thead className="bg-gov-sunk text-left text-[12px] text-gov-ink2"><tr><th className="px-3 py-2">시장</th><th className="px-3 py-2">품목</th><th className="px-3 py-2 text-right">도매가</th><th className="px-3 py-2">단위</th><th className="px-3 py-2">시간</th></tr></thead>
              <tbody>{data.items.map((item, i) => <tr key={`${item.market}-${item.auction_at}-${i}`} className="border-t border-gov-line2"><td className="px-3 py-2">{item.market}</td><td className="px-3 py-2">{item.item || "—"}</td><td className="px-3 py-2 text-right font-semibold tabular">{won(item.price)}</td><td className="px-3 py-2">{item.unit || "—"}</td><td className="px-3 py-2 text-gov-ink3">{item.auction_at || "—"}</td></tr>)}</tbody>
            </table>
          </div>}
          </>
        ) : (
          <div className="mt-4 rounded-md border border-gov-line2 bg-gov-sunk px-4 py-5 text-center text-[13px] text-gov-ink2">
            <p className="font-semibold text-gov-ink">최근 도매가</p>
            <p className="mt-1">전일자 가격 자료를 불러오고 있어요.</p>
          </div>
        )}
          {!compact && data?.items.filter((item) => item.price != null).length ? (
          <div className="mt-5 border-t border-gov-line2 pt-4">
            <p className="mb-2 text-[13px] font-semibold text-gov-ink">최근 30일 일평균 도매가 흐름</p>
            <div className="h-44 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.daily_series?.length ? data.daily_series.map((x) => ({ ...x, market: "", item: "", unit: "", auction_at: x.date })) : [...data.items].filter((item) => item.price != null).reverse()} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                  <XAxis dataKey={data.daily_series?.length ? "date" : "auction_at"} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis width={58} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}천`} />
                  <Tooltip formatter={(v) => [`${Number(v).toLocaleString("ko-KR")}원`, "일평균 낙찰가"]} labelFormatter={(v) => `${v}`} />
                  <Line type="monotone" dataKey="price" stroke="#2f6b4f" strokeWidth={2.5} dot={{ r: 3, fill: "#2f6b4f" }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {showQuarterly && data.daily_series?.length ? (() => {
              const monthly = monthlyFromDaily(data.daily_series);
              return monthly.length ? (
                <div className="mt-5 border-t border-gov-line2 pt-4">
                  <p className="mb-2 text-[13px] font-semibold text-gov-ink">월별 평균 낙찰가 흐름</p>
                  <QuarterlyAuctionChart series={data.daily_series} />
                  <p className="mt-1 text-[11px] text-gov-ink3">일별 자료가 있는 분기만 표시해요.</p>
                </div>
              ) : null;
            })() : null}
          </div>
        ) : null}
        {showComparison && (cropIdOverride || cropId) && (() => { const item = compare?.items[0]; const latest = data?.items[0]; const cards = [["1일 전", item?.previous_day_price ?? latest?.previous_day_price], ["7일 전", item?.seven_day_price ?? latest?.seven_day_price], ["1년 전", item?.year_price ?? latest?.year_price]] as const; return <div className="mt-5 border-t border-gov-line2 pt-4"><p className="mb-2 text-[13px] font-semibold text-gov-ink">기간별 가격 비교</p><div className="grid gap-2 sm:grid-cols-3">{cards.map(([label, price]) => <div key={label} className="rounded-md bg-gov-sunk px-3 py-4"><p className="text-[13px] font-semibold text-gov-ink2">{label}</p><p className="mt-2 text-[21px] font-bold tabular text-gov-ink">{won(price)}</p></div>)}</div><p className="mt-3 text-[11px] leading-relaxed text-gov-ink3">최근일자 도·소매 가격정보 기준으로 계산했어요.</p></div>; })()}
        <p className="mt-3 text-[11px] text-gov-ink3">한국농수산식품유통공사 일별 도·소매 가격정보 · 전일자까지 집계된 자료를 기준으로 보여드려요. 참고용으로만 봐 주세요.</p>
      </Panel>
    </Section>
  );
}
