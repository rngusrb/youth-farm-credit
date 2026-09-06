"use client";

import { useEffect, useState } from "react";
import { Badge, Crumb, DefTable, Notice, Page, PageTitle, Panel, Section, Stat } from "@/components/gov";
import { fetchStats, type DataStats } from "@/lib/api";
import { won } from "@/lib/format";

export default function StatsPage() {
  const [d, setD] = useState<DataStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchStats().then(setD).catch(() => setError("데이터 현황을 불러오지 못했어요."));
  }, []);

  return (
    <Page>
      <Crumb trail={[{ label: "데이터" }, { label: "데이터 현황" }]} />
      <PageTitle
        title="데이터 현황"
        lead="이 서비스가 쓰는 값이 어디서 왔고 무엇이 아직 가정인지 그대로 공개해요."
      />

      <div id="main">
        {error && <Notice tone="danger">{error}</Notice>}
        {d && (
          <>
            <Section title="수록 데이터">
              <Panel>
                <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                  <Stat label="작목" value={d.crops.total.toString()} unit="종"
                        note={`전부 변동성 실측 (${d.crops.sigma_measured}종)`} />
                  <Stat label="변동성 범위" value={`${d.crops.sigma_min.toFixed(2)}–${d.crops.sigma_max.toFixed(2)}`}
                        note="작목별 소득이 흔들리는 정도 σ" />
                  <Stat label="지침 조항" value={d.corpus.chunks.toLocaleString("ko-KR")} unit="개" />
                  <Stat label="시뮬레이션" value={(d.simulation.n_sim / 10000).toString()} unit="만회"
                        note={`난수 시드 ${d.simulation.seed} 고정 — 같은 입력이면 같은 결과`} />
                </div>
              </Panel>
            </Section>

            <Section title="아직 채우는 중">
              <div className="table-scroll overflow-x-auto" tabIndex={0} role="region" aria-label="표 또는 차트 상세 · 좌우로 스크롤">
                <table className="w-full min-w-[560px] border-t border-gov-ink/70 text-[14px]">
                  <thead>
                    <tr className="bg-gov-sunk text-left text-[12px] font-semibold text-gov-ink2">
                      <th className="border-b border-gov-line px-4 py-3">항목</th>
                      <th className="border-b border-gov-line px-4 py-3">채움</th>
                      <th className="border-b border-gov-line px-4 py-3">없을 때 어떻게 하나</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["도매가 시계열 (KAMIS)", `${d.crops.with_market} / ${d.crops.total}`,
                       "시장 국면 화면만 비고, 변동성은 소득조사 실측값을 써요"],
                      ["KAMIS 품목 매핑", `${d.crops.with_kamis_mapping} / ${d.crops.total}`,
                       "매핑이 있는 작목부터 순차로 도매가를 수집해요"],
                      ["출하월", `${d.crops.with_harvest_months} / ${d.crops.total}`,
                       "월별 들어오고 나가는 돈을 12개월 균등으로 펼치고 ‘출하월 미상’으로 표시해요"],
                    ].map(([k, v, how]) => (
                      <tr key={k} className="border-b border-gov-line2">
                        <td className="px-4 py-3 font-medium text-gov-ink">{k}</td>
                        <td className="tabular px-4 py-3 text-gov-ink2">{v}</td>
                        <td className="px-4 py-3 text-[13px] text-gov-ink2">{how}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section title="정책자금 상품">
              <div className="grid gap-4 sm:grid-cols-2">
                {d.products.map((p) => (
                  <Panel key={p.id}>
                    <h3 className="mb-3 text-[15px] font-bold text-gov-ink">{p.name}</h3>
                    <DefTable
                      rows={[
                        ["한도", won(p.limit)],
                        ["금리", `연 ${(p.rate * 100).toFixed(1)}% 고정`],
                        ["갚는 방법", `${p.grace_years}년 동안 이자만 · ${p.amort_years}년 동안 원금을 같은 금액으로 나눠 갚기`],
                        ["1억당 연 가장 많이 갚는 돈", won((1 / p.amort_years + p.rate) * 100_000_000)],
                      ]}
                    />
                    <p className="mt-2.5 text-[12px] leading-relaxed text-gov-ink3">{p.source}</p>
                  </Panel>
                ))}
              </div>
            </Section>

            <Section title="지침 원문과 대조한 결과">
              <p className="mb-3 text-[13px] text-gov-ink2">
                {d.verified_against_guideline.document} · 확인일 {d.verified_against_guideline.checked_on}
              </p>
              <div className="space-y-3">
                {d.verified_against_guideline.confirmed.map((c) => (
                  <Panel key={c.item}>
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <Badge tone="ok">일치</Badge>
                      <span className="text-[14px] font-bold text-gov-ink">{c.item}</span>
                      <span className="text-[12px] text-gov-ink3">p.{c.page}</span>
                    </div>
                    <blockquote className="rounded-r-md border-l-4 border-gov-line bg-gov-sunk px-3 py-2 text-[12px] leading-relaxed text-gov-ink2">
                      {c.quote}
                    </blockquote>
                    <p className="mt-2 text-[13px] text-gov-ink2">{c.model}</p>
                  </Panel>
                ))}
                {d.verified_against_guideline.not_modelled.map((c) => (
                  <Panel key={c.item}>
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <Badge tone="warn">미반영</Badge>
                      <span className="text-[14px] font-bold text-gov-ink">{c.item}</span>
                      <span className="text-[12px] text-gov-ink3">p.{c.page}</span>
                    </div>
                    <blockquote className="rounded-r-md border-l-4 border-gov-line bg-gov-sunk px-3 py-2 text-[12px] leading-relaxed text-gov-ink2">
                      {c.quote}
                    </blockquote>
                    <p className="mt-2 text-[13px] text-gov-ink2">{c.why}</p>
                  </Panel>
                ))}
              </div>
            </Section>

            <Notice tone="info" title="변동성 분해">
              {d.sigma_decomposition.note}
            </Notice>
          </>
        )}
      </div>
    </Page>
  );
}
