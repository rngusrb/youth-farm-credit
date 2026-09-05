"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Panel, Section } from "@/components/gov";
import { fetchMarketCompare, fetchRealtimeAuction, type MarketCompare, type RealtimeAuction } from "@/lib/api";
import { loadProfile } from "@/lib/profile";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const won = (value: number | null) => value == null ? "—" : `${value.toLocaleString("ko-KR")}원`;

export default function AuctionSummary({ cropId: cropIdOverride }: { cropId?: string } = {}) {
  const [data, setData] = useState<RealtimeAuction | null>(null);
  const [compare, setCompare] = useState<MarketCompare | null>(null);
  const [cropId, setCropId] = useState<string | undefined>();
  useEffect(() => {
    const id = cropIdOverride ?? loadProfile()?.cropId;
    setCropId(id);
    fetchRealtimeAuction(id, 5).then(setData).catch(() => setData({ status: "empty", items: [] }));
    fetchMarketCompare(id).then(setCompare).catch(() => setCompare({ status: "empty", items: [] }));
    const timer = window.setInterval(() => { fetchRealtimeAuction(id, 5).then(setData).catch(() => {}); fetchMarketCompare(id).then(setCompare).catch(() => {}); }, 120_000);
    return () => window.clearInterval(timer);
  }, [cropIdOverride]);

  return (
    <Section title="전국 경매가 요약" action={<Link href="/market" className="inline-flex min-h-11 items-center text-[12px] text-gov-ink3 hover:text-gov-link">자세히 보기 +</Link>}>
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-[16px] font-bold text-gov-ink">
              {data?.crop ? `${data.crop} 최근 경매가` : cropId ? "내 작물 최근 경매가" : "내 작물 시세를 확인해 보세요"}
            </h3>
            <p className="mt-1 text-[13px] leading-relaxed text-gov-ink2">
              {data?.match_level ? `같은 ${data.match_level} 품목의 전국 공영도매시장 자료예요.` : "농장 정보를 입력하면 같은 품목의 경매가를 보여드려요."}
            </p>
          </div>
          {data?.status === "ok" && <Badge tone="ok">최근 자료</Badge>}
        </div>
        {data?.items.length ? (
          <>
          <div className="mt-4 rounded-md border border-gov-link/30 bg-gov-soft px-4 py-3">
            <p className="text-[12px] text-gov-ink2">가장 최근 낙찰가</p>
            <p className="mt-1 text-[24px] font-extrabold tabular text-gov-head">{won(data.items[0].price)}</p>
            <p className="mt-1 text-[12px] text-gov-ink3">{data.items[0].market} · {data.items[0].auction_at || "최근 경매"}</p>
          </div>
          {data.average_price != null && <div className="mt-3 rounded-md border border-gov-line2 px-4 py-3"><p className="text-[12px] text-gov-ink2">{data.average_label}</p><p className="mt-1 text-[20px] font-bold tabular text-gov-ink">{won(data.average_price)}</p><p className="mt-1 text-[11px] text-gov-ink3">현재 API가 제공하는 최근 1개월 경매 자료 기준이에요.</p></div>}
          <div className="mt-4 overflow-x-auto rounded-md border border-gov-line2">
            <table className="w-full min-w-[520px] text-[13px]">
              <thead className="bg-gov-sunk text-left text-[12px] text-gov-ink2"><tr><th className="px-3 py-2">시장</th><th className="px-3 py-2">품목</th><th className="px-3 py-2 text-right">낙찰가</th><th className="px-3 py-2">단위</th><th className="px-3 py-2">시간</th></tr></thead>
              <tbody>{data.items.map((item, i) => <tr key={`${item.market}-${item.auction_at}-${i}`} className="border-t border-gov-line2"><td className="px-3 py-2">{item.market}</td><td className="px-3 py-2">{item.item || "—"}</td><td className="px-3 py-2 text-right font-semibold tabular">{won(item.price)}</td><td className="px-3 py-2">{item.unit || "—"}</td><td className="px-3 py-2 text-gov-ink3">{item.auction_at || "—"}</td></tr>)}</tbody>
            </table>
          </div>
          </>
        ) : (
          <p className="mt-4 rounded-md bg-gov-sunk px-4 py-5 text-center text-[13px] text-gov-ink2">지금은 보여드릴 경매 자료가 없어요. 잠시 후 다시 확인해 주세요.</p>
        )}
        {data?.items.filter((item) => item.price != null).length ? (
          <div className="mt-5 border-t border-gov-line2 pt-4">
            <p className="mb-2 text-[13px] font-semibold text-gov-ink">최근 낙찰가 흐름</p>
            <div className="h-44 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={[...data.items].filter((item) => item.price != null).reverse()} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                  <XAxis dataKey="auction_at" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis width={58} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}천`} />
                  <Tooltip formatter={(v) => [`${Number(v).toLocaleString("ko-KR")}원`, "낙찰가"]} labelFormatter={(v) => `경매 ${v}`} />
                  <Line type="monotone" dataKey="price" stroke="#2f6b4f" strokeWidth={2.5} dot={{ r: 3, fill: "#2f6b4f" }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : null}
        {(cropIdOverride || cropId) && compare?.items.length ? <div className="mt-5 border-t border-gov-line2 pt-4"><p className="mb-2 text-[13px] font-semibold text-gov-ink">전일·전년 가격 비교</p><div className="grid gap-2 sm:grid-cols-3">{compare.items.slice(0, 3).map((item, i) => <div key={`${item.item}-${item.market}-${i}`} className="rounded-md bg-gov-sunk px-3 py-3"><p className="truncate text-[12px] text-gov-ink2">{item.market || item.item}</p><p className="mt-1 text-[17px] font-bold tabular text-gov-ink">{won(item.price)}</p><p className="mt-1 text-[11px] text-gov-ink3">전일 {won(item.previous_day_price)} · 전년 같은 시기 {won(item.year_price)}</p></div>)}</div><p className="mt-2 text-[11px] text-gov-ink3">공판장 평균가 기준이에요. 자료 날짜: {compare.items[0].date || "—"}</p></div> : null}
        <p className="mt-3 text-[11px] text-gov-ink3">공공데이터포털 농산물 실시간 경매가 · 2분마다 새로 확인해요. 참고용으로만 봐 주세요.</p>
      </Panel>
    </Section>
  );
}
