"use client";

import AmountCompare from "@/components/AmountCompare";
import EligibilityCheck from "@/components/EligibilityCheck";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Btn, DefTable, Empty, Notice, PageTitle, Panel, Section, Stat } from "@/components/gov";
import { fetchProducts, runDiagnose, type Diagnosis, type ProductRow, fetchEligibility, type ProductEligibility } from "@/lib/api";
import { headlineLimit, headlineScenario, unsafeGap } from "@/lib/diagnosis";
import { useFarm } from "@/lib/useFarm";
import { pct, pyeong as fmtPyeong, ratio, won } from "@/lib/format";

export default function FinancePage() {
  const { profile, ready } = useFarm();
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [elig, setElig] = useState<ProductEligibility[]>([]);
  const [eligNote, setEligNote] = useState("");
  /** null = 아직 안 옴, "" = 정상 응답, 그 외 = 실패 사유.
      "못 불러옴" 과 "조항이 없음" 은 다른 일이다 — 화면이 틀린 이유를 대지 않게 나눈다. */
  const [eligError, setEligError] = useState<string | null>(null);
  /** 농가가 직접 대보는 금액. 계산은 엔진이 한다 — 화면은 값을 넘기기만 한다. */
  const [ask, setAsk] = useState("");
  const [asked, setAsked] = useState<number | null>(null);
  const [relief, setRelief] = useState<{ damage_min: number; damage_max: number; defer_years: number }[]>([]);
  const [reliefSource, setReliefSource] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 자격 요건은 코퍼스에서 온다. 못 가져오면 섹션이 비고, 그건 정상이다 —
    // 없는 근거로 자격을 말하지 않는다. (조용히 넘기지 않도록 로그는 남긴다)
    fetchEligibility()
      .then((e) => { setElig(e.products); setEligNote(e.note); setEligError(""); })
      .catch((err) => {
        console.warn("자격 요건을 불러오지 못했습니다:", err);
        setEligError(err instanceof Error ? err.message : String(err));
      });
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
      requested_principal: asked,
    }).then(setDiag).catch(() => setError("계산에 실패했어요."));
  }, [profile, asked]);

  if (!ready) return null;
  if (!profile) {
    return (
      <>
        <PageTitle title="맞춤 금융지원" lead="농가 정보가 있어야 계산해요." />
        <Empty title="농가 정보가 없어요" body="작목과 면적을 먼저 입력해 주세요."
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
        lead="신청 가능한 최대 한도가 아니라, 거치가 끝난 뒤에도 감당할 수 있는 차입 원금을 역산해요."
      />

      {error && <div className="mb-5"><Notice tone="danger">{error}</Notice></div>}

      {diag && (
        <>
          <Section title="세 가지 한도">
            <div className="grid gap-px bg-gov-line sm:grid-cols-3">
              {[
                ["제도상 신청 가능", diag.limits.available, "시행지침이 정한 세대당 한도", "plain",
                 "갚을 수 있는지와는 무관해요."],
                ["은행이 보는 선", diag.limits.recommended, `버는 돈이 갚을 돈의 ${ratio(diag.target_dscr)}배 (DSCR ${ratio(diag.target_dscr)})`, "warn",
                 "소득이 흔들리지 않는다는 가정에서 나온 값이에요."],
                ["소득 변동까지 반영", headlineLimit(diag), `2년 연속 상환이 밀릴 확률 ${pct(diag.limits.max_crisis_prob)} 이하`, "ok",
                 "가격 변동과 재해까지 넣고 25년을 3만 번 돌린 결과예요."],
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
                <Notice tone="warn" title={`두 금액 사이가 ${won(unsafeGap(diag))}이에요`}>
                  {won(diag.limits.available)}을 다 빌리면 2년 연속 위기 확률이{" "}
                  {pct(diag.scenarios.at_available?.crisis_prob ?? 0)}, {won(headlineLimit(diag))}
                  에서는 {pct(diag.limits.max_crisis_prob)}예요. 거치가 끝나는{" "}
                  {diag.product.grace_years + 1}년차에 상환액이 {won(s?.grace_payment ?? 0)}에서{" "}
                  {won(s?.amort_payment ?? 0)}로 뛰기 때문이에요.
                </Notice>
              </div>
            )}
          </Section>

          <Section title="금액별로 무엇이 달라지나">
            <Panel>
              <AmountCompare d={diag} />
              <form
                className="mt-4 flex flex-wrap items-center gap-2 border-t border-gov-line2 pt-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const man = Number(ask.trim());
                  // 만원 단위로 받아 원으로 넘긴다. 계산은 전부 엔진이 한다.
                  setAsked(Number.isFinite(man) && man > 0 ? man * 10_000 : null);
                }}
              >
                <label htmlFor="ask" className="text-[13px] font-semibold text-gov-ink2">
                  직접 금액 대보기
                </label>
                <input
                  id="ask" type="number" inputMode="numeric" min={0} step={100}
                  value={ask} onChange={(e) => setAsk(e.target.value)}
                  placeholder="예: 10000"
                  className="tabular h-11 w-32 rounded-md border border-gov-line px-3 text-right text-[13px]"
                />
                <span className="text-[13px] text-gov-ink3">만원</span>
                <button type="submit"
                        className="inline-flex min-h-11 items-center rounded-md border border-gov-head bg-gov-head px-4 text-[13px] font-semibold text-white">
                  표에 넣기
                </button>
                {asked != null && (
                  <button type="button" onClick={() => { setAsk(""); setAsked(null); }}
                          className="inline-flex min-h-11 items-center rounded-md border border-gov-line px-3 text-[13px] text-gov-ink2">
                    빼기
                  </button>
                )}
              </form>
            </Panel>
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
                  <Link href="/app/farm" className="lnk mt-2.5 inline-flex min-h-11 items-center text-[12px]">
                    이 자금으로 다시 계산 →
                  </Link>
                </Panel>
              ))}
            </div>
          </Section>

          <Section title="신청 자격 스스로 대보기">
            {elig.length > 0 ? (
              <EligibilityCheck data={elig} note={eligNote} />
            ) : eligError === null ? (
              <p className="text-[13px] text-gov-ink3">요건을 불러오는 중이에요.</p>
            ) : eligError ? (
              <Notice tone="danger" title="요건을 불러오지 못했어요">
                자료실에 조항이 없다는 뜻은 아니에요 — 서버에서 받아오는 데 실패했어요.
                잠시 뒤 다시 열어 주세요. ({eligError})
              </Notice>
            ) : (
              <Notice tone="info">
                자격 요건 조항을 자료실에서 찾지 못해 표시하지 않아요. 없는 근거로
                해당 여부를 말하지 않아요.
              </Notice>
            )}
          </Section>

          <Section title="함께 확인할 것">
            <div className="space-y-3">
              <Notice tone="info" title="농신보 보증">
                담보가 부족해도 농림수산업자신용보증기금 보증으로 대출이 가능해요. 다만
                <b> 보증료율이 지침에 명시돼 있지 않아 이 계산에는 넣지 않았어요.</b>{" "}
                실제로는 상환여력에서 차감되므로 위 금액은 그만큼 낙관적이에요.
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
