"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge, Crumb, DefTable, Empty, Notice, Page, PageTitle, Panel, Section, Stat } from "@/components/gov";
import { fetchCrop, fetchCrops, type CropDetail, type CropRow } from "@/lib/api";

const REGIME: Record<string, { label: string; tone: "ok" | "plain" | "warn" }> = {
  calm: { label: "평소보다 조용함", tone: "ok" },
  normal: { label: "평상 수준", tone: "plain" },
  turbulent: { label: "평소보다 요동침", tone: "warn" },
};

function Body() {
  const params = useSearchParams();
  const [rows, setRows] = useState<CropRow[]>([]);
  const [id, setId] = useState("");
  const [detail, setDetail] = useState<CropDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCrops()
      .then((d) => {
        setRows(d.crops);
        const wanted = params.get("crop");
        const withMarket = d.crops.find((c) => c.has_market);
        setId((wanted && d.crops.some((c) => c.id === wanted) ? wanted : null) ?? withMarket?.id ?? d.crops[0]?.id ?? "");
      })
      .catch(() => setError("작목 목록을 불러오지 못했습니다."));
  }, [params]);

  useEffect(() => {
    if (!id) return;
    fetchCrop(id).then(setDetail).catch(() => setError("작목 정보를 불러오지 못했습니다."));
  }, [id]);

  const m = detail?.market;
  const g = m?.garch;

  return (
    <>
      {error && <Notice tone="danger">{error}</Notice>}

      <Panel className="mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="crop" className="text-[13px] font-semibold text-gov-ink2">작목 선택</label>
          <select id="crop" value={id} onChange={(e) => setId(e.target.value)}
                  className="min-h-11 border border-gov-line px-3 text-[13px] outline-none focus:border-gov-link">
            {rows.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.has_market ? " (도매가 수집됨)" : ""}</option>
            ))}
          </select>
          <span className="text-[12px] text-gov-ink3">
            도매가 시계열 보유 {rows.filter((c) => c.has_market).length}종 / 전체 {rows.length}종
          </span>
        </div>
      </Panel>

      {detail && !m && (
        <Empty
          title={`${detail.name}은 도매가 시계열을 아직 수집하지 않았습니다`}
          body="KAMIS 품목 매핑이 있는 작목부터 순차로 수집합니다. 소득 변동성은 KOSIS 소득조사 실측값을 쓰므로 진단 결과에는 영향이 없습니다."
        />
      )}

      {detail && m && g && (
        <>
          <Section title="현재 국면">
            <Panel>
              <div className="grid gap-6 sm:grid-cols-3">
                <Stat label={detail.name} value={REGIME[g.regime]?.label ?? g.regime}
                      tone={REGIME[g.regime]?.tone === "warn" ? "warn" : REGIME[g.regime]?.tone === "ok" ? "ok" : "plain"}
                      note={`현재 변동성이 장기 평균의 ${g.current_over_longrun.toFixed(2)}배`} />
                <Stat label="충격 반감기" value={g.half_life_days.toFixed(1)} unit="일"
                      note={`지속성 ${g.persistence.toFixed(2)} — 가격 충격이 가라앉는 속도`} />
                <Stat label="관측" value={m.trading_days.toLocaleString("ko-KR")} unit="거래일" />
              </div>
              <div className="mt-4">
                <Notice tone="info" title="국면은 한도 계산에 반영하지 않습니다">
                  25년 상환에 본질적인 것은 장기 평균입니다. 조용한 시기라고 해서 더 빌려도
                  된다는 뜻이 아니므로, 이 값은 참고 지표로만 씁니다.
                </Notice>
              </div>
            </Panel>
          </Section>

          <Section title="교차검증">
            <div className="grid gap-5 lg:grid-cols-2">
              <Panel>
                <p className="mb-3 text-[13px] leading-relaxed text-gov-ink2">
                  소득조사와 완전히 다른 자료로 같은 값을 다시 잽니다. 두 기관의 조사가 비슷한
                  값을 가리키면 변동성 추정이 독립적으로 뒷받침됩니다.
                </p>
                <DefTable
                  rows={[
                    ["KAMIS 도매가 σ", <span key="a" className="tabular">{m.annual_price_sigma?.toFixed(3) ?? "—"}</span>],
                    ["KOSIS 농가수취가 σ", <span key="b" className="tabular">{m.kosis_price_sigma?.toFixed(3) ?? "—"}</span>],
                    ["차이", <span key="c" className="tabular">
                      {m.annual_price_sigma != null && m.kosis_price_sigma != null
                        ? Math.abs(m.annual_price_sigma - m.kosis_price_sigma).toFixed(3) : "—"}
                    </span>],
                  ]}
                />
                <p className="mt-2.5 text-[12px] leading-relaxed text-gov-ink3">{m.source}</p>
              </Panel>

              <Panel>
                <h3 className="mb-3 text-[14px] font-bold text-gov-ink">수확기</h3>
                <div className="flex gap-1">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((mm) => {
                    const on = detail.harvest_months.includes(mm);
                    return (
                      <div key={mm} className="flex-1 text-center">
                        <div className={`h-10 ${on ? "bg-gov-link/70" : "bg-gov-line2"}`}
                             title={`${mm}월${on ? " 출하" : ""}`} />
                        <div className={`mt-1 text-[12px] ${on ? "font-semibold text-gov-head" : "text-gov-ink3"}`}>{mm}</div>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-[12px] leading-relaxed text-gov-ink2">
                  {detail.harvest_months.length
                    ? "출하가 몇 달에 몰릴수록 그 시점의 시세 하나에 한 해 소득이 걸립니다."
                    : "이 작목은 출하월 정보를 아직 확보하지 못했습니다. 월별 현금흐름은 12개월 균등으로 펼쳐 계산합니다."}
                </p>
              </Panel>
            </div>
          </Section>
        </>
      )}
    </>
  );
}

export default function MarketPage() {
  return (
    <Page>
      <Crumb trail={[{ label: "데이터" }, { label: "시세 · 국면" }]} />
      <PageTitle
        title="시세 · 국면"
        lead="KAMIS 일별 도매가에 GARCH(1,1)를 적합해 지금 시장이 평소보다 조용한지 요동치는지 봅니다."
      />
      <div id="main">
        <Suspense fallback={<p className="text-[14px] text-gov-ink2">불러오는 중…</p>}>
          <Body />
        </Suspense>
      </div>
    </Page>
  );
}
