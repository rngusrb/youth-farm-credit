"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Panel, Section } from "@/components/gov";
import { fetchMarketCompare, fetchRealtimeAuction, type MarketCompare, type RealtimeAuction } from "@/lib/api";
import { loadProfile } from "@/lib/profile";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const won = (value: number | null | undefined) => value == null ? "—" : `${value.toLocaleString("ko-KR")}원`;
const trendSentence = (current: number | null | undefined, year: number | null | undefined) => {
  if (current == null || year == null || year <= 0) return null;
  const pct = ((current - year) / year) * 100;
  if (Math.abs(pct) < 3) return "지난해 같은 시기와 비슷한 가격이에요.";
  return `지난해 같은 시기보다 ${Math.abs(pct).toFixed(0)}% ${pct > 0 ? "비싸요" : "낮아요"}.`;
};
const quarterSeries = (series: RealtimeAuction["daily_series"]) => {
  const groups = new Map<string, number[]>();
  for (const row of series ?? []) {
    const date = new Date(row.date);
    if (Number.isNaN(date.getTime()) || row.price == null) continue;
    const key = `${date.getFullYear()}년 ${Math.floor(date.getMonth() / 3) + 1}분기`;
    const values = groups.get(key) ?? [];
    values.push(row.price);
    groups.set(key, values);
  }
  return [...groups.entries()].map(([quarter, values]) => ({
    quarter,
    price: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
  }));
};

export default function AuctionSummary({ cropId: cropIdOverride, showComparison = true, compact = false }: { cropId?: string; showComparison?: boolean; compact?: boolean } = {}) {
  const [data, setData] = useState<RealtimeAuction | null>(null);
  const [compare, setCompare] = useState<MarketCompare | null>(null);
  const [cropId, setCropId] = useState<string | undefined>();
  useEffect(() => {
    const id = cropIdOverride ?? loadProfile()?.cropId;
    setCropId(id);
    fetchRealtimeAuction(id, 5, !compact).then(setData).catch(() => setData({ status: "empty", items: [] }));
    if (showComparison) fetchMarketCompare(id).then(setCompare).catch(() => setCompare({ status: "empty", items: [] }));
    const timer = window.setInterval(() => { fetchRealtimeAuction(id, 5, !compact).then(setData).catch(() => {}); if (showComparison) fetchMarketCompare(id).then(setCompare).catch(() => {}); }, 300_000);
    return () => window.clearInterval(timer);
  }, [cropIdOverride, showComparison]);

  return (
    <Section title="전국 경매가 요약" action={<Link href="/market" className="inline-flex min-h-11 items-center text-[12px] text-gov-ink3 hover:text-gov-link">자세히 보기 +</Link>}>
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-[16px] font-bold text-gov-ink">
              {data?.crop ? `${data.crop} 최근 경매가` : cropId ? "내 작물 최근 경매가" : "내 작물 시세를 확인해 보세요"}
            </h3>
            <p className="mt-1 text-[13px] leading-relaxed text-gov-ink2">
              {data?.match_level === "전국" ? "전국 공영도매시장의 최신 경매 자료예요." : data?.match_level ? `같은 ${data.match_level} 품목의 전국 공영도매시장 자료예요.` : "농장 정보를 입력하면 같은 품목의 경매가를 보여드려요."}
            </p>
          </div>
          {data?.status === "ok" && <Badge tone="ok">최근 자료</Badge>}
        </div>
        {data?.items.length ? (
          <>
          <div className={`mt-4 rounded-md border border-gov-link/30 bg-gov-soft px-4 py-3 ${compact ? "" : "space-y-2"}`}>
            <div className={compact ? "grid grid-cols-2 gap-3" : "space-y-2"}>
              <div className="flex flex-col gap-1"><p className="text-[12px] text-gov-ink2">가장 최근 낙찰가</p><p className="text-[24px] font-extrabold tabular text-gov-head">{won(data.items[0].price)}</p></div>
              {data.average_price != null && <div className={compact ? "flex flex-col gap-1 border-l border-gov-link/20 pl-3" : "flex items-baseline justify-between gap-3 border-t border-gov-link/15 pt-2"}><p className="text-[12px] text-gov-ink2">{data.average_label}</p><p className="text-[20px] font-bold tabular text-gov-ink">{won(data.average_price)}</p></div>}
            </div>
            <p className="text-right text-[11px] text-gov-ink3">{data.items[0].item || "선택 품목"} · {data.items[0].market} · 상품(상) · {data.items[0].unit || "단위"}</p>
            <p className="text-right text-[11px] text-gov-ink3">자료 시각: {data.items[0].auction_at || "확인 시각 없음"}</p>
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
              <thead className="bg-gov-sunk text-left text-[12px] text-gov-ink2"><tr><th className="px-3 py-2">시장</th><th className="px-3 py-2">품목</th><th className="px-3 py-2 text-right">낙찰가</th><th className="px-3 py-2">단위</th><th className="px-3 py-2">시간</th></tr></thead>
              <tbody>{data.items.map((item, i) => <tr key={`${item.market}-${item.auction_at}-${i}`} className="border-t border-gov-line2"><td className="px-3 py-2">{item.market}</td><td className="px-3 py-2">{item.item || "—"}</td><td className="px-3 py-2 text-right font-semibold tabular">{won(item.price)}</td><td className="px-3 py-2">{item.unit || "—"}</td><td className="px-3 py-2 text-gov-ink3">{item.auction_at || "—"}</td></tr>)}</tbody>
            </table>
          </div>}
          </>
        ) : (
          <p className="mt-4 rounded-md bg-gov-sunk px-4 py-5 text-center text-[13px] text-gov-ink2">지금은 보여드릴 경매 자료가 없어요. 잠시 후 다시 확인해 주세요.</p>
        )}
          {!compact && data?.items.filter((item) => item.price != null).length ? (
          <div className="mt-5 border-t border-gov-line2 pt-4">
            <p className="mb-2 text-[13px] font-semibold text-gov-ink">최근 30일 일평균 낙찰가 흐름</p>
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
            {data.daily_series?.length ? (() => {
              const quarterly = quarterSeries(data.daily_series);
              return quarterly.length ? (
                <div className="mt-5 border-t border-gov-line2 pt-4">
                  <p className="mb-2 text-[13px] font-semibold text-gov-ink">분기별 평균 낙찰가 흐름</p>
                  <div className="h-44 w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={quarterly} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                        <XAxis dataKey="quarter" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={18} />
                        <YAxis width={58} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}천`} />
                        <Tooltip formatter={(v) => [`${Number(v).toLocaleString("ko-KR")}원`, "분기 평균 낙찰가"]} labelFormatter={(v) => `${v}`} />
                        <Line type="monotone" dataKey="price" stroke="#7a4e2d" strokeWidth={2.5} dot={{ r: 3, fill: "#7a4e2d" }} activeDot={{ r: 5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-1 text-[11px] text-gov-ink3">일별 자료가 있는 분기만 표시해요.</p>
                </div>
              ) : null;
            })() : null}
          </div>
        ) : null}
        {showComparison && (cropIdOverride || cropId) && compare?.items.length ? (() => { const item = compare.items[0]; const cards = [["1일 전", item.previous_day_price], ["7일 전", item.seven_day_price], ["1년 전", item.year_price]] as const; return <div className="mt-5 border-t border-gov-line2 pt-4"><p className="mb-2 text-[13px] font-semibold text-gov-ink">기간별 가격 비교</p><div className="grid gap-2 sm:grid-cols-3">{cards.map(([label, price]) => <div key={label} className="rounded-md bg-gov-sunk px-3 py-4"><p className="text-[13px] font-semibold text-gov-ink2">{label}</p><p className="mt-2 text-[21px] font-bold tabular text-gov-ink">{won(price)}</p></div>)}</div><p className="mt-3 text-[11px] leading-relaxed text-gov-ink3">{item.item} · 상품 등급 ‘상’ 기준 · {item.unit || "거래 단위"}{item.unit_qty ? ` ${item.unit_qty}` : ""} 단위예요.<br />공판장 평균가 기준, 자료 날짜: {item.date || "—"}</p></div>; })() : null}
        <p className="mt-3 text-[11px] text-gov-ink3">공공데이터포털 농산물 실시간 경매가 · 5분마다 새로 확인해요. 참고용으로만 봐 주세요.</p>
      </Panel>
    </Section>
  );
}
