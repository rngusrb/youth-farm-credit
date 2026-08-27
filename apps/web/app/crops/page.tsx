"use client";

import { DRIVER_LABEL } from "@/lib/diagnosis";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Crumb, Notice, Page, PageTitle, Panel } from "@/components/gov";
import { fetchCrops, type CropRow } from "@/lib/api";
import { won } from "@/lib/format";

type SortKey = "sigma" | "income" | "name";
const SORTS: [SortKey, string][] = [["sigma", "변동성순"], ["income", "소득순"], ["name", "이름순"]];

export default function CropsPage() {
  const [rows, setRows] = useState<CropRow[]>([]);
  const [source, setSource] = useState("");
  const [group, setGroup] = useState("전체");
  const [sort, setSort] = useState<SortKey>("sigma");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCrops()
      .then((d) => { setRows(d.crops); setSource(d.source); })
      .catch(() => setError("작목 목록을 불러오지 못했어요."));
  }, []);

  const groups = useMemo(
    () => ["전체", ...Array.from(new Set(rows.map((r) => r.group).filter(Boolean) as string[]))],
    [rows],
  );

  const view = useMemo(() => {
    let f = group === "전체" ? rows : rows.filter((r) => r.group === group);
    if (query.trim()) f = f.filter((r) => r.name.includes(query.trim()));
    return [...f].sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name, "ko")
        : sort === "income" ? b.income_per_10a - a.income_per_10a
        : b.sigma - a.sigma);
  }, [rows, group, sort, query]);

  const maxSigma = Math.max(...rows.map((r) => r.sigma), 0.001);

  return (
    <Page>
      <Crumb trail={[{ label: "데이터" }, { label: "작목 데이터" }]} />
      <PageTitle
        title="작목 데이터"
        lead={`같은 소득이어도 변동성이 크면 감당할 수 있는 대출은 작아집니다. 작목별 소득과 변동성을 실측한 표예요. 출처: ${source || "농촌진흥청 농산물소득조사"} — 조사연도는 작목마다 달라 소득 옆에 적었어요.`}
      />

      <div id="main">
        {error && <Notice tone="danger">{error}</Notice>}

        <Panel className="mb-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label htmlFor="search" className="text-[13px] font-semibold text-gov-ink2">작목명</label>
              <input id="search" value={query} onChange={(e) => setQuery(e.target.value)}
                     placeholder="예: 딸기"
                     className="w-40 min-h-11 rounded-md border border-gov-line px-3 text-[13px] outline-none focus:border-gov-link" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-semibold text-gov-ink2">정렬</span>
              {SORTS.map(([k, l]) => (
                <button key={k} onClick={() => setSort(k)}
                        aria-pressed={sort === k}
                        className={`inline-flex min-h-11 items-center rounded-md border px-3 text-[12px] ${
                          sort === k ? "border-gov-head bg-gov-soft font-semibold text-gov-head"
                                     : "border-gov-line text-gov-ink2 hover:border-gov-link"}`}>
                  {l}
                </button>
              ))}
            </div>
            <span className="ml-auto text-[12px] text-gov-ink3">{view.length}건</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-gov-line2 pt-3">
            {groups.map((g) => (
              <button key={g} onClick={() => setGroup(g)}
                      aria-pressed={group === g}
                      className={`inline-flex min-h-11 items-center rounded-md border px-3 text-[12px] ${
                        group === g ? "border-gov-head bg-gov-soft font-semibold text-gov-head"
                                    : "border-gov-line text-gov-ink2 hover:border-gov-link"}`}>
                {g}
              </button>
            ))}
          </div>
        </Panel>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] border-t border-gov-ink/70 text-[14px]">
            <caption className="sr-only">작목별 소득과 소득 변동성</caption>
            <thead>
              <tr className="bg-gov-sunk text-left text-[12px] font-semibold text-gov-ink2">
                <th scope="col" className="border-b border-gov-line px-4 py-3">작목</th>
                <th scope="col" className="border-b border-gov-line px-4 py-3">10a당 소득</th>
                <th scope="col" className="border-b border-gov-line px-4 py-3">소득 변동성 σ</th>
                <th scope="col" className="border-b border-gov-line px-4 py-3">주 변동요인</th>
                <th scope="col" className="border-b border-gov-line px-4 py-3">측정</th>
                <th scope="col" className="border-b border-gov-line px-4 py-3">시세</th>
              </tr>
            </thead>
            <tbody>
              {view.map((c) => (
                <tr key={c.id} className="border-b border-gov-line2 hover:bg-gov-sunk">
                  <th scope="row" className="px-4 py-3 text-left font-medium text-gov-ink">
                    {c.name}
                    {c.group && <span className="block text-[12px] font-normal text-gov-ink3">{c.group}</span>}
                  </th>
                  <td className="px-4 py-3 text-gov-ink2">
                    <span className="tabular">{won(c.income_per_10a)}</span>
                    {/* 조사연도는 작목마다 다르다 — 표 위에 한 줄로 뭉뚱그리면 거짓이 된다. */}
                    {c.income_year && (
                      <span className="tabular mt-0.5 block text-[12px] text-gov-ink3">
                        {c.income_year}년 조사
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="tabular w-11 text-gov-ink">{c.sigma.toFixed(3)}</span>
                      <span className="h-2 w-24 bg-gov-line2" aria-hidden>
                        <span className="block h-full bg-gov-link/70" style={{ width: `${(c.sigma / maxSigma) * 100}%` }} />
                      </span>
                    </div>
                    {c.sigma_ci && (
                      <span className="tabular mt-0.5 block text-[12px] text-gov-ink3">
                        95% {c.sigma_ci[0].toFixed(3)}–{c.sigma_ci[1].toFixed(3)}
                        {c.sigma_n ? ` · ${c.sigma_n}개년` : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gov-ink2">{c.driver ? DRIVER_LABEL[c.driver] : "—"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={c.sigma_source === "MEASURED" ? "ok" : "warn"}>
                      {c.sigma_source === "MEASURED" ? "실측" : "가정"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {c.has_market
                      ? <Link href={`/market?crop=${c.id}`} className="lnk inline-flex min-h-11 items-center text-[13px]">국면 보기</Link>
                      : <span className="text-[12px] text-gov-ink3">미수집</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6">
          <Notice tone="info" title="변동성은 두 부분으로 나뉩니다">
            여기 표시된 σ 는 시장이 함께 겪는 <b>공통 변동</b>과 농가마다 다른 <b>고유 변동</b>을
            합친 값이에요. 공통 변동은 전국 평균 시계열에서 실측하지만, 고유 변동은 평균에서
            상쇄돼 보이지 않으므로 가정값(0.17)을 써요. 「내 농가」에 소득 이력을 넣으면
            그 부분이 실측으로 바뀝니다.
          </Notice>
        </div>
      </div>
    </Page>
  );
}
