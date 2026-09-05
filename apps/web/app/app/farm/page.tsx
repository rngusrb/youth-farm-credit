"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Btn, Notice, PageTitle, Panel, Section } from "@/components/gov";
import { extractSlots, fetchCrops, fetchProducts, type CropRow, type ProductRow, type MarketCategory } from "@/lib/api";
import { clearProfile, loadProfile, saveProfile } from "@/lib/profile";
import { won } from "@/lib/format";
import { CSV_MARKET_CATEGORIES } from "@/lib/productCategories";

const MAN = 10_000;
const field = "w-full min-h-11 rounded-md border border-gov-line px-3.5 text-[14px] outline-none focus:border-gov-link";
const label = "mb-1.5 block text-[13px] font-semibold text-gov-ink2";

export default function FarmPage() {
  const router = useRouter();
  const [crops, setCrops] = useState<CropRow[]>([]);
  const [categories, setCategories] = useState<MarketCategory[]>(CSV_MARKET_CATEGORIES);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [cropId, setCropId] = useState("");
  const [largeCode, setLargeCode] = useState("");
  const [middleCode, setMiddleCode] = useState("");
  const [productId, setProductId] = useState("successor_farmer");
  const [pyeong, setPyeong] = useState("");
  const [living, setLiving] = useState("2400");
  const [debt, setDebt] = useState("");
  const [history, setHistory] = useState("");
  const [planPyeong, setPlanPyeong] = useState("");
  const [planPrincipal, setPlanPrincipal] = useState("");
  const [sentence, setSentence] = useState("");
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchCrops(), fetchProducts()])
      .then(([c, p]) => {
        setCrops(c.crops);
        setCategories(CSV_MARKET_CATEGORIES);
        setProducts(p.products);
        const prev = loadProfile();
        setCropId(prev?.cropId ?? c.crops[0]?.id ?? "");
        const initial = c.crops.find((x) => x.id === (prev?.cropId ?? c.crops[0]?.id));
        setLargeCode(initial?.large_code ?? "");
        setMiddleCode(initial?.middle_code ?? "");
        if (prev) {
          setProductId(prev.productId);
          setPyeong(String(prev.pyeong));
          setLiving(String(prev.livingCost / MAN));
          setDebt(prev.otherDebtService ? String(prev.otherDebtService / MAN) : "");
          setHistory(prev.incomeHistory.map((v) => v / MAN).join(", "));
          setPlanPyeong(prev.plannedPyeong ? String(prev.plannedPyeong) : "");
          setPlanPrincipal(
            prev.targetPrincipal ? String(prev.targetPrincipal / MAN) : "",
          );
        }
      })
      .catch(() => setError("서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요."));
  }, []);

  const parsedHistory = history
    .split(/[,\s]+/)
    .map((v) => Number(v.replace(/[^\d.]/g, "")))
    .filter((v) => v > 0)
    .map((v) => v * MAN);

  const crop = crops.find((c) => c.id === cropId);
  const categoryRows = categories.length ? categories : CSV_MARKET_CATEGORIES;
  const largeGroups = Array.from(new Map(categoryRows.map((c) => [c.large_code, c.large_name])).entries());
  const middleGroups = categoryRows.filter((c) => Number(c.large_code) === Number(largeCode));

  /** 대화형 인테이크 — 자연어를 슬롯으로 바꾼다. 채워진 칸만 알려 준다. */
  async function readSentence() {
    if (!sentence.trim() || reading) return;
    setReading(true);
    setReadNote(null);
    try {
      const r = await extractSlots(sentence, {});
      const filled: string[] = [];
      if (r.slots.crop_id && crops.some((c) => c.id === r.slots.crop_id)) {
        setCropId(r.slots.crop_id); filled.push("작목");
      }
      if (r.slots.pyeong) { setPyeong(String(r.slots.pyeong)); filled.push("면적"); }
      if (r.slots.living_cost) { setLiving(String(r.slots.living_cost / MAN)); filled.push("생활비"); }
      setReadNote(filled.length ? `${filled.join(" · ")}을(를) 채웠어요. 나머지는 직접 확인해 주세요.`
                                : "문장에서 알아볼 수 있는 값이 없었어요. 아래에 직접 넣어 주세요.");
    } catch {
      setReadNote("문장을 읽지 못했어요. 아래에 직접 넣어 주세요.");
    } finally {
      setReading(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!cropId || !Number(pyeong)) {
      setError("작목과 재배 면적은 반드시 필요해요.");
      return;
    }
    saveProfile({
      cropId, productId,
      pyeong: Number(pyeong),
      livingCost: Number(living || 0) * MAN,
      otherDebtService: Number(debt || 0) * MAN,
      incomeHistory: parsedHistory,
      plannedPyeong: Number(planPyeong) || undefined,
      targetPrincipal: Number(planPrincipal) ? Number(planPrincipal) * MAN : undefined,
    });
    setError(null);
    router.push("/app");
  }

  return (
    <>
      <PageTitle
        title="내 농장정보 입력"
        lead="농장 현황과 올해 계획을 알려 주세요. 이 브라우저에 저장해 두고, 분석할 때 필요한 정보를 서버로 보내 계산해요."
      />

      {error && <div className="mb-5"><Notice tone="danger">{error}</Notice></div>}

      <Section title="말로 입력하기">
        <Panel>
          <p className="mb-3 text-[13px] leading-relaxed text-gov-ink2">
            농장 상황을 한 문장으로 적어 보세요. 알아볼 수 있는 항목을 먼저 채워 드려요.
            채워진 내용은 아래에서 확인해 주세요.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="sentence" className="sr-only">농장 상황 한 문장</label>
            <input id="sentence" value={sentence} onChange={(e) => setSentence(e.target.value)}
                   placeholder="예: 딸기 수경 1200평 하고 있고 생활비는 한 해 3천만원쯤 써요"
                   className={field} />
            <button type="button" onClick={() => void readSentence()} disabled={reading}
                    className="shrink-0 rounded-md rounded-lg border border-gov-line bg-white px-4 text-[13px] font-semibold text-gov-ink2 hover:border-gov-link hover:text-gov-head disabled:opacity-50">
              {reading ? "읽는 중" : "입력 도와주기"}
            </button>
          </div>
          {readNote && <p className="mt-2.5 text-[12px] text-gov-link">{readNote}</p>}
        </Panel>
      </Section>

      <form onSubmit={submit}>
        <Section title="현재 농장 살림">
          <Panel>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={label} htmlFor="crop">
                  키우는 작물 <span className="text-gov-point">*</span>
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <select aria-label="작물 대분류" value={largeCode} onChange={(e) => { setLargeCode(e.target.value); setMiddleCode(""); setCropId(""); }} className={field}>
                    <option value="">대분류를 선택하세요</option>{largeGroups.map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}
                  </select>
                  <select id="crop" aria-label="작물 중분류" value={middleCode} disabled={!largeCode} onChange={(e) => { const code = e.target.value; setMiddleCode(code); const selected = middleGroups.find((c) => c.middle_code === code); const found = crops.find((c) => c.middle_code === code || c.middle_code?.endsWith(code) || code.endsWith(c.middle_code ?? "") || (!!selected && c.name.includes(selected.middle_name))); setCropId(found?.id ?? ""); }} className={field}>
                    <option value="">중분류를 선택하세요</option>{middleGroups.map((c) => <option key={`${c.large_code}-${c.middle_code}`} value={c.middle_code}>{c.middle_name} ({c.middle_code})</option>)}
                  </select>
                </div>
                {crop && <p className="mt-2 text-[12px] text-gov-ink3">선택한 작물: {crop.name} · 10a당 번 돈 {won(crop.income_per_10a)}</p>}
              </div>
              <div>
                <label className={label} htmlFor="pyeong">
                  재배 면적 (평) <span className="text-gov-point">*</span>
                </label>
                <input id="pyeong" inputMode="numeric" value={pyeong}
                       onChange={(e) => setPyeong(e.target.value)} placeholder="1200" className={field} />
              </div>
              <div>
                <label className={label} htmlFor="living">한 해 생활비 (만원)</label>
                <input id="living" inputMode="numeric" value={living}
                       onChange={(e) => setLiving(e.target.value)} className={field} />
              </div>
              <div>
                <label className={label} htmlFor="debt">기존 대출에 한 해 갚는 돈 (만원)</label>
                <input id="debt" inputMode="numeric" value={debt}
                       onChange={(e) => setDebt(e.target.value)} placeholder="없으면 비워 두세요" className={field} />
              </div>
              <div>
                <label className={label} htmlFor="product">정책자금</label>
                <select id="product" value={productId} onChange={(e) => setProductId(e.target.value)} className={field}>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.grace_years}년 동안 이자만 · {p.amort_years}년
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Panel>
        </Section>

        <Section title="지난해까지 번 돈 (선택)">
          <Panel>
            <p className="mb-3 text-[13px] leading-relaxed text-gov-ink2">
              연도순 농사로 번 돈을 만원 단위로, 쉼표로 구분해 넣어 주세요. 3개년 이상이면 작목
              평균 대신 <b className="text-gov-ink">내 농가의 실제 소득과 변동성</b>으로 계산해요
              — 평균보다 잘 벌면 한도가 올라가고, 못 벌면 내려가요.
            </p>
            <label htmlFor="history" className="sr-only">연도순 농사로 번 돈</label>
            <textarea id="history" rows={3} value={history} onChange={(e) => setHistory(e.target.value)}
                      placeholder="4200, 3800, 5100, 4400" className={`${field} resize-none`} />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone={parsedHistory.length >= 3 ? "info" : "plain"}>{parsedHistory.length}개년 입력</Badge>
              <span className="text-[12px] text-gov-ink3">
                {parsedHistory.length >= 3 ? "변동성을 개인화해요" : "3개년부터 반영돼요"}
              </span>
              {crop && (
                <span className="ml-auto text-[12px] text-gov-ink3">
                  {crop.name} 작목 평균 σ {crop.sigma.toFixed(3)}
                  {crop.sigma_n ? ` (${crop.sigma_n}개년 실측)` : ""}
                </span>
              )}
            </div>
          </Panel>
        </Section>

        <Section title="올해 농사·자금 계획 (선택)">
          <Panel>
            <p className="mb-3 text-[13px] leading-relaxed text-gov-ink2">
              올해 하려는 규모와 빌리려는 금액을 넣으면, 모든 화면이 <b className="text-gov-ink">그
              계획대로 계산</b>해요. 넣지 않으면 지금 면적과 권장 한도로 봅니다.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="planPyeong">올해 하려는 면적 (평)</label>
                <input id="planPyeong" inputMode="numeric" value={planPyeong}
                       onChange={(e) => setPlanPyeong(e.target.value)}
                       placeholder="안 늘리면 비워 두세요" className={field} />
              </div>
              <div>
                <label className={label} htmlFor="planPrincipal">빌리려는 금액 (만원)</label>
                <input id="planPrincipal" inputMode="numeric" value={planPrincipal}
                       onChange={(e) => setPlanPrincipal(e.target.value)}
                       placeholder="아직 모르면 비워 두세요" className={field} />
              </div>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-gov-ink3">
              자금 용도는 받지 않아요. 지금 제도가 후계농 자금 2종뿐이라 용도로 갈리는 계산이
              없어서예요 — 채우게 해 놓고 아무것도 하지 않는 칸은 두지 않습니다.
            </p>
          </Panel>
        </Section>

        <div className="flex flex-wrap items-center gap-3">
          <Btn type="submit">저장하고 홈으로</Btn>
          <button type="button"
                  onClick={() => { clearProfile(); setPyeong(""); setHistory(""); setDebt("");
                                 setPlanPyeong(""); setPlanPrincipal(""); }}
                  className="inline-flex min-h-11 items-center text-[13px] text-gov-ink3 underline underline-offset-2 hover:text-gov-point">
            저장된 정보 지우기
          </button>
        </div>
      </form>
    </>
  );
}
