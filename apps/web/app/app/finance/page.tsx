"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Btn, DefTable, Empty, Notice, PageTitle, Panel, Section, Stat } from "@/components/gov";
import { fetchProducts, runDiagnose, type Diagnosis, type ProductRow } from "@/lib/api";
import { headlineLimit, headlineScenario, unsafeGap } from "@/lib/diagnosis";
import { useFarm } from "@/lib/useFarm";
import { pct, pyeong as fmtPyeong, ratio, won } from "@/lib/format";

export default function FinancePage() {
  const { profile, ready } = useFarm();
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [relief, setRelief] = useState<{ damage_min: number; damage_max: number; defer_years: number }[]>([]);
  const [reliefSource, setReliefSource] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProducts()
      .then((p) => { setProducts(p.products); setRelief(p.disaster_relief); setReliefSource(p.relief_source); })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!profile) return;
    runDiagnose({
      crop_id: profile.cropId, pyeong: profile.pyeong, living_cost: profile.livingCost,
      other_debt_service: profile.otherDebtService, product_id: profile.productId,
      income_history: profile.incomeHistory,
    }).then(setDiag).catch(() => setError("계산에 실패했습니다."));
  }, [profile]);

  if (!ready) return null;
  if (!profile) {
    return (
      <>
        <PageTitle title="맞춤 금융지원" lead="농가 정보가 있어야 계산합니다." />
        <Empty title="농가 정보가 없습니다" body="작목과 면적을 먼저 입력해 주세요."
               cta={{ href: "/app/farm", label: "내 농가 정보 입력" }} />
      </>
    );
  }

  const s = diag ? headlineScenario(diag) : undefined;
  const current = products.find((p) => p.id === diag?.product.id);
  const others = products.filter((p) => p.id !== diag?.product.id);

  return (
    <>
      <PageTitle
        title="맞춤 금융지원"
        lead="신청 가능한 최대 한도가 아니라, 거치가 끝난 뒤에도 감당할 수 있는 차입 원금을 역산합니다."
      />

      {error && <div className="mb-5"><Notice tone="danger">{error}</Notice></div>}

      {diag && (
        <>
          <Section title="세 가지 한도">
            <div className="grid gap-px bg-gov-line sm:grid-cols-3">
              {[
                ["제도상 신청 가능", diag.limits.available, "시행지침이 정한 세대당 한도", "plain",
                 "갚을 수 있는지와는 무관합니다."],
                ["은행 심사 관행", diag.limits.recommended, `DSCR ${ratio(diag.target_dscr)} 기준`, "warn",
                 "소득이 흔들리지 않는다는 가정에서 나온 값입니다."],
                ["AI 권장 차입", headlineLimit(diag), `2년연속 위기 ${pct(diag.limits.max_crisis_prob)} 이하`, "ok",
                 "가격 변동과 재해까지 넣고 25년을 3만 번 돌린 결과입니다."],
              ].map(([label, value, sub, tone, why]) => (
                <div key={label as string} className="bg-white p-5">
                  <div className="text-[12px] font-medium text-gov-ink3">{label as string}</div>
                  <div className={`tabular mt-1.5 text-[26px] font-extrabold leading-none ${
                    tone === "ok" ? "text-gov-ok" : tone === "warn" ? "text-gov-warn" : "text-gov-ink"}`}>
                    {won(value as number)}
                  </div>
                  <div className="mt-1.5 text-[12px] font-medium text-gov-ink2">{sub as string}</div>
                  <p className="mt-2 text-[12px] leading-relaxed text-gov-ink3">{why as string}</p>
                </div>
              ))}
            </div>

            {unsafeGap(diag) > 0 && (
              <div className="mt-4">
                <Notice tone="warn" title={`${won(unsafeGap(diag))} 는 “빌릴 수는 있지만 갚기는 어려운” 구간입니다`}>
                  제도 한도까지 빌리면 거치가 끝나는 {diag.product.grace_years + 1}년차부터
                  상환액이 {won(s?.grace_payment ?? 0)}에서 {won(s?.amort_payment ?? 0)}로 뜁니다.
                  소득은 그만큼 늘어나 있지 않은 경우가 많습니다.
                </Notice>
              </div>
            )}
          </Section>

          <Section title="이 금액이 나온 근거">
            <div className="grid gap-5 lg:grid-cols-2">
              <Panel>
                <h3 className="mb-3 text-[14px] font-bold text-gov-ink">상환여력</h3>
                <DefTable
                  rows={[
                    ["연 농업소득", <span key="a" className="tabular">{won(diag.income.annual)}</span>],
                    ["생활비", <span key="b" className="tabular">− {won(diag.input.living_cost)}</span>],
                    ["기존 부채상환", <span key="c" className="tabular">
                      {diag.input.other_debt_service ? `− ${won(diag.input.other_debt_service)}` : "없음"}
                    </span>],
                    ["상환에 쓸 수 있는 돈", <b key="d" className="tabular">{won(diag.income.capacity)}</b>],
                  ]}
                />
              </Panel>
              <Panel>
                <h3 className="mb-3 text-[14px] font-bold text-gov-ink">권장 금액에서의 상환</h3>
                <DefTable
                  rows={[
                    ["거치기간 연 이자", <span key="a" className="tabular">{won(s?.grace_payment ?? 0)}</span>],
                    [`${diag.product.grace_years + 1}년차 상환액`, <span key="b" className="tabular">
                      {won(s?.amort_payment ?? 0)}
                      <span className="ml-1.5 text-[12px] text-gov-point">
                        {(s?.cliff_multiple ?? 0).toFixed(1)}배
                      </span>
                    </span>],
                    ["마지막 해 상환액", <span key="c" className="tabular">{won(s?.amort_payment_last ?? 0)}</span>],
                    ["최소 필요 면적", <span key="d" className="tabular">
                      {fmtPyeong(diag.min_area_pyeong)}
                      <span className="ml-1.5 text-[12px] text-gov-ink3">
                        (현재 {fmtPyeong(diag.input.pyeong)})
                      </span>
                    </span>],
                  ]}
                />
              </Panel>
            </div>
          </Section>

          <Section title="이용 가능한 정책자금">
            <div className="grid gap-4 sm:grid-cols-2">
              {current && (
                <Panel className="border-gov-head">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge tone="info">현재 선택</Badge>
                    <h3 className="text-[15px] font-bold text-gov-ink">{current.name}</h3>
                  </div>
                  <DefTable rows={[
                    ["한도", won(current.limit)],
                    ["금리", `연 ${(current.rate * 100).toFixed(1)}% 고정`],
                    ["상환", `${current.grace_years}년 거치 ${current.amort_years}년 원금 균등분할`],
                  ]} />
                </Panel>
              )}
              {others.map((p) => (
                <Panel key={p.id}>
                  <h3 className="mb-2 text-[15px] font-bold text-gov-ink">{p.name}</h3>
                  <DefTable rows={[
                    ["한도", won(p.limit)],
                    ["금리", `연 ${(p.rate * 100).toFixed(1)}% 고정`],
                    ["상환", `${p.grace_years}년 거치 ${p.amort_years}년 원금 균등분할`],
                  ]} />
                  {p.note && <p className="mt-2.5 text-[12px] leading-relaxed text-gov-ink3">{p.note}</p>}
                  <Link href="/app/farm" className="lnk mt-2.5 inline-block text-[12px]">
                    이 자금으로 다시 계산 →
                  </Link>
                </Panel>
              ))}
            </div>
          </Section>

          <Section title="함께 확인할 것">
            <div className="space-y-3">
              <Notice tone="info" title="농신보 보증">
                담보가 부족해도 농림수산업자신용보증기금 보증으로 대출이 가능합니다. 다만
                <b> 보증료율이 지침에 명시돼 있지 않아 이 계산에는 반영하지 않았습니다.</b>{" "}
                실제로는 상환여력에서 차감되므로 위 금액은 그만큼 낙관적입니다.
              </Notice>
              {relief.length > 0 && (
                <Notice tone="info" title="재해 시 상환연기">
                  {relief.map((r) => `피해율 ${Math.round(r.damage_min * 100)}~${Math.round(r.damage_max * 100)}% → ${r.defer_years}년 연기`).join(" · ")}
                  <span className="mt-1 block text-[12px] text-gov-ink3">{reliefSource}</span>
                </Notice>
              )}
            </div>
          </Section>

          <div className="flex gap-2">
            <Btn href={`/result/${diag.diagnosis_id}`}>전체 리포트 보기</Btn>
            <Btn href="/app/safety" variant="ghost">안전진단 다시 받기</Btn>
          </div>
        </>
      )}
    </>
  );
}
