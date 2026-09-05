"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge, Crumb, DefTable, Empty, Notice, Page, PageTitle, Panel, Section, Stat } from "@/components/gov";
import { fetchCrop, fetchCrops, type CropDetail, type CropRow } from "@/lib/api";
import AuctionSummary from "@/components/AuctionSummary";
import Fold from "@/components/Fold";

const REGIME: Record<string, { label: string; tone: "ok" | "plain" | "warn" }> = {
  calm: { label: "가격 변화가 작아요", tone: "ok" },
  normal: { label: "평상 수준", tone: "plain" },
  turbulent: { label: "가격 변화가 커요", tone: "warn" },
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
      .catch(() => setError("작목 목록을 불러오지 못했어요."));
  }, [params]);

  useEffect(() => {
    if (!id) return;
    fetchCrop(id).then(setDetail).catch(() => setError("작목 정보를 불러오지 못했어요."));
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
                  className="min-h-11 rounded-md border border-gov-line px-3 text-[13px] outline-none focus:border-gov-link">
            {rows.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.has_market ? " (도매가 수집됨)" : ""}</option>
            ))}
          </select>
          <span className="text-[12px] text-gov-ink3">
            도매가 시계열 보유 {rows.filter((c) => c.has_market).length}종 / 전체 {rows.length}종
          </span>
        </div>
      </Panel>

      {id && <AuctionSummary cropId={id} />}

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
                <p className="mt-1 text-[11px] text-gov-ink3">분석에 사용한 가격 자료 {m.trading_days.toLocaleString("ko-KR")}거래일 · {m.window?.join(" ~ ") ?? "기간 확인 중"}</p>
              </div>
              <div className="mt-4">
                <Notice tone="info" title="요즘 가격 흐름은 대출금 계산에 넣지 않아요">
                  25년 상환에 본질적인 것은 장기 평균이에요. 조용한 시기라고 해서 더 빌려도
                  된다는 뜻이 아니므로, 이 값은 참고 지표로만 써요.
                </Notice>
              </div>
            </Panel>
          </Section>

          <Section title="교차검증">
            <Fold tone="gov" open={false} summary="자료를 다시 비교해 보기" hint="KAMIS · KOSIS">
            <div className="grid gap-5 lg:grid-cols-2">
              <Panel>
                <p className="mb-3 text-[13px] leading-relaxed text-gov-ink2">
                  소득조사와 완전히 다른 자료로 같은 값을 다시 잽니다. 두 기관의 조사가 비슷한
                  값을 가리키면 변동성 추정이 독립적으로 뒷받침돼요.
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
                <p className="mt-2.5 text-[12px] leading-relaxed text-gov-ink3">
                  {m.source}
                  {m.window && (
                    <>
                      {" "}· 시계열 {m.window[0]}~{m.window[1]} ({m.trading_days.toLocaleString("ko-KR")}거래일)
                    </>
                  )}
                </p>
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
                    ? "출하가 몇 달에 몰릴수록 그 시점의 시세 하나에 한 해 소득이 걸려요."
                    : "이 작목은 출하월 정보를 아직 확보하지 못했어요. 월별 들어오고 나가는 돈은 12개월 균등으로 펼쳐 계산해요."}
                </p>
              </Panel>
            </div>
            </Fold>
          </Section>

          <Section title="가격 예측과 신뢰구간">
            <Fold tone="gov" open={false} summary="앞으로의 가격을 어떻게 계산하나요?" hint="예측 방식 안내">
              <div className="space-y-3 text-[13px] leading-relaxed text-gov-ink2">
                <p>작목마다 계절과 출하 시기가 달라요. 먼저 같은 작목·등급·단위의 일평균 가격으로 계절 흐름을 잡아요.</p>
                <p>그다음 최근 가격의 흔들림을 반영해 예상 범위를 계산해요. 가운데 선은 예상값이고, 띠는 80% 신뢰구간이에요.</p>
                <p className="text-gov-ink3">거래일이 충분하면 계절형 통계모델을 쓰고, 자료가 쌓인 작목만 시계열 학습모델을 비교해요. 검증 점수가 낮으면 예측을 표시하지 않아요.</p>
                <div className="rounded-md bg-gov-sunk px-3 py-3 text-[12px] text-gov-ink3">
                  현재 화면의 변동성 값은 장기 참고값이에요. 일별 예측과 신뢰구간은 원천 경매 시계열이 충분히 쌓인 뒤 별도로 검증해 표시해요.
                </div>
              </div>
            </Fold>
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
