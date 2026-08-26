"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/shell/PageHeader";
import Disclaimer from "@/components/shell/Disclaimer";
import { Card, Page, Pill } from "@/components/ui";
import { fetchCrops, type CropRow } from "@/lib/api";
import { won } from "@/lib/format";

const DRIVER: Record<string, string> = { price: "가격", quantity: "수확량", cost: "경영비" };
type SortKey = "name" | "income" | "sigma";

export default function CropsPage() {
  const [rows, setRows] = useState<CropRow[]>([]);
  const [source, setSource] = useState("");
  const [group, setGroup] = useState<string>("전체");
  const [sort, setSort] = useState<SortKey>("sigma");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCrops()
      .then((d) => {
        setRows(d.crops);
        setSource(d.source);
      })
      .catch(() => setError("백엔드에 연결하지 못했습니다."));
  }, []);

  const groups = useMemo(
    () => ["전체", ...Array.from(new Set(rows.map((r) => r.group).filter(Boolean) as string[]))],
    [rows],
  );

  const view = useMemo(() => {
    const f = group === "전체" ? rows : rows.filter((r) => r.group === group);
    return [...f].sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name, "ko")
        : sort === "income"
          ? b.income_per_10a - a.income_per_10a
          : b.sigma - a.sigma,
    );
  }, [rows, group, sort]);

  const maxSigma = Math.max(...rows.map((r) => r.sigma), 0.001);

  return (
    <Page>
      <PageHeader
        title="작목 데이터"
        lead={`소득 변동성 σ 는 작목마다 다르게 실측합니다. 같은 소득이어도 σ 가 크면 감당할 수 있는 대출은 작아집니다. ${source}`}
        aside={
          <div className="flex gap-2 text-xs">
            {(["sigma", "income", "name"] as SortKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setSort(k)}
                className={`rounded-lg border px-2.5 py-1.5 transition ${
                  sort === k
                    ? "border-signal-warn/50 text-signal-warn"
                    : "border-ink-700 text-slate-500 hover:text-slate-300"
                }`}
              >
                {{ sigma: "변동성순", income: "소득순", name: "이름순" }[k]}
              </button>
            ))}
          </div>
        }
      />

      {error && (
        <div className="mb-5 rounded-lg border border-signal-danger/40 bg-signal-danger/10 px-4 py-3 text-sm text-signal-danger">
          {error}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-1.5">
        {groups.map((g) => (
          <button
            key={g}
            onClick={() => setGroup(g)}
            className={`rounded-full border px-3 py-1 text-[11px] transition ${
              group === g
                ? "border-slate-500 text-slate-100"
                : "border-ink-700 text-slate-500 hover:text-slate-300"
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-ink-800 text-left text-[11px] uppercase tracking-[0.06em] text-slate-500">
              <th className="px-4 py-3 font-medium">작목</th>
              <th className="px-4 py-3 font-medium">10a당 소득</th>
              <th className="px-4 py-3 font-medium">소득 변동성 σ</th>
              <th className="px-4 py-3 font-medium">주 변동요인</th>
              <th className="px-4 py-3 font-medium">측정</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {view.map((c) => (
              <tr key={c.id} className="transition hover:bg-ink-800/40">
                <td className="px-4 py-3">
                  <Link href={`/market?crop=${c.id}`} className="font-medium hover:text-signal-warn">
                    {c.name}
                  </Link>
                  {c.group && <div className="text-[11px] text-slate-600">{c.group}</div>}
                </td>
                <td className="tabular px-4 py-3 text-slate-300">{won(c.income_per_10a)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="tabular w-12 text-slate-300">{c.sigma.toFixed(3)}</span>
                    <span className="h-1.5 w-24 overflow-hidden rounded-full bg-ink-800">
                      <span
                        className="block h-full rounded-full bg-signal-warn/70"
                        style={{ width: `${(c.sigma / maxSigma) * 100}%` }}
                      />
                    </span>
                  </div>
                  {c.sigma_ci && (
                    <div className="tabular mt-0.5 text-[10px] text-slate-600">
                      95% {c.sigma_ci[0].toFixed(3)}–{c.sigma_ci[1].toFixed(3)}
                      {c.sigma_n ? ` · ${c.sigma_n}개년` : ""}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-400">
                  {c.driver ? DRIVER[c.driver] : <span className="text-slate-600">—</span>}
                </td>
                <td className="px-4 py-3">
                  <Pill tone={c.sigma_source === "MEASURED" ? "ok" : "warn"}>
                    {c.sigma_source === "MEASURED" ? "실측" : "가정"}
                  </Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="mt-4 text-[11px] leading-relaxed text-slate-600">
        σ 는 전국 평균 시계열에서 실측한 <b className="text-slate-500">공통(시장) 성분</b>과 농가마다
        다른 <b className="text-slate-500">고유 성분</b>의 합입니다. 고유 성분은 전국 평균에서 상쇄돼
        보이지 않으므로 가정값(0.17)을 쓰며, 「내 농가」에 소득 이력을 넣으면 그 부분이 실측으로
        바뀝니다.
      </p>

      <Disclaimer />
    </Page>
  );
}
