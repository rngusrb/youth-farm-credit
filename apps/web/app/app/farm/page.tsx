"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Btn, Notice, PageTitle, Panel, Section } from "@/components/gov";
import { extractSlots, fetchCrops, fetchProducts, type CropRow, type ProductRow } from "@/lib/api";
import { clearProfile, loadProfile, saveProfile } from "@/lib/profile";
import { won } from "@/lib/format";

const MAN = 10_000;
const field = "w-full min-h-11 rounded-md border border-gov-line px-3.5 text-[14px] outline-none focus:border-gov-link";
const label = "mb-1.5 block text-[13px] font-semibold text-gov-ink2";

export default function FarmPage() {
  const router = useRouter();
  const [crops, setCrops] = useState<CropRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [cropId, setCropId] = useState("");
  const [productId, setProductId] = useState("successor_farmer");
  const [pyeong, setPyeong] = useState("");
  const [living, setLiving] = useState("2400");
  const [debt, setDebt] = useState("");
  const [history, setHistory] = useState("");
  const [sentence, setSentence] = useState("");
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchCrops(), fetchProducts()])
      .then(([c, p]) => {
        setCrops(c.crops);
        setProducts(p.products);
        const prev = loadProfile();
        setCropId(prev?.cropId ?? c.crops[0]?.id ?? "");
        if (prev) {
          setProductId(prev.productId);
          setPyeong(String(prev.pyeong));
          setLiving(String(prev.livingCost / MAN));
          setDebt(prev.otherDebtService ? String(prev.otherDebtService / MAN) : "");
          setHistory(prev.incomeHistory.map((v) => v / MAN).join(", "));
        }
      })
      .catch(() => setError("백엔드에 연결하지 못했습니다."));
  }, []);

  const parsedHistory = history
    .split(/[,\s]+/)
    .map((v) => Number(v.replace(/[^\d.]/g, "")))
    .filter((v) => v > 0)
    .map((v) => v * MAN);

  const crop = crops.find((c) => c.id === cropId);

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
      setReadNote(filled.length ? `${filled.join(" · ")}을(를) 채웠습니다. 나머지는 직접 확인해 주세요.`
                                : "문장에서 알아볼 수 있는 값이 없었습니다. 아래에 직접 넣어 주세요.");
    } catch {
      setReadNote("문장을 읽지 못했습니다. 아래에 직접 넣어 주세요.");
    } finally {
      setReading(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!cropId || !Number(pyeong)) {
      setError("작목과 재배 면적은 반드시 필요합니다.");
      return;
    }
    saveProfile({
      cropId, productId,
      pyeong: Number(pyeong),
      livingCost: Number(living || 0) * MAN,
      otherDebtService: Number(debt || 0) * MAN,
      incomeHistory: parsedHistory,
    });
    setError(null);
    router.push("/app");
  }

  return (
    <>
      <PageTitle
        title="내 농가 정보"
        lead="한 번 넣어 두면 모든 화면이 이 값으로 계산합니다. 로그인 계정과 무관하게 이 브라우저에만 저장되며 서버로 보내지 않습니다."
      />

      {error && <div className="mb-5"><Notice tone="danger">{error}</Notice></div>}

      <Section title="말로 입력하기">
        <Panel>
          <p className="mb-3 text-[13px] leading-relaxed text-gov-ink2">
            항목을 하나씩 채우기 번거로우면 문장으로 적어 보세요. 알아들은 칸만 채우고,
            못 알아들은 칸은 비워 둡니다 — 지어내지 않습니다.
          </p>
          <div className="flex gap-2">
            <label htmlFor="sentence" className="sr-only">농가 상황 문장</label>
            <input id="sentence" value={sentence} onChange={(e) => setSentence(e.target.value)}
                   placeholder="예: 딸기 수경 1200평 하고 있고 생활비는 한 해 3천만원쯤 씁니다"
                   className={field} />
            <button type="button" onClick={() => void readSentence()} disabled={reading}
                    className="shrink-0 rounded-md rounded-lg border border-gov-line bg-white px-4 text-[13px] font-semibold text-gov-ink2 hover:border-gov-link hover:text-gov-head disabled:opacity-50">
              {reading ? "읽는 중" : "읽기"}
            </button>
          </div>
          {readNote && <p className="mt-2.5 text-[12px] text-gov-link">{readNote}</p>}
        </Panel>
      </Section>

      <form onSubmit={submit}>
        <Section title="경영 정보">
          <Panel>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={label} htmlFor="crop">
                  작목 <span className="text-gov-point">*</span>
                </label>
                <select id="crop" value={cropId} onChange={(e) => setCropId(e.target.value)} className={field}>
                  {crops.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} · 10a당 소득 {won(c.income_per_10a)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label} htmlFor="pyeong">
                  재배 면적 (평) <span className="text-gov-point">*</span>
                </label>
                <input id="pyeong" inputMode="numeric" value={pyeong}
                       onChange={(e) => setPyeong(e.target.value)} placeholder="1200" className={field} />
              </div>
              <div>
                <label className={label} htmlFor="living">연 생활비 (만원)</label>
                <input id="living" inputMode="numeric" value={living}
                       onChange={(e) => setLiving(e.target.value)} className={field} />
              </div>
              <div>
                <label className={label} htmlFor="debt">기존 연 부채상환 (만원)</label>
                <input id="debt" inputMode="numeric" value={debt}
                       onChange={(e) => setDebt(e.target.value)} placeholder="없으면 비워 두세요" className={field} />
              </div>
              <div>
                <label className={label} htmlFor="product">정책자금</label>
                <select id="product" value={productId} onChange={(e) => setProductId(e.target.value)} className={field}>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.grace_years}년거치 {p.amort_years}년
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Panel>
        </Section>

        <Section title="소득 이력 (선택)">
          <Panel>
            <p className="mb-3 text-[13px] leading-relaxed text-gov-ink2">
              연도순 농업소득을 만원 단위로, 쉼표로 구분해 넣습니다. 3개년 이상이면 작목
              평균 대신 <b className="text-gov-ink">내 농가의 실제 변동성</b>으로 계산합니다.
            </p>
            <label htmlFor="history" className="sr-only">연도순 농업소득</label>
            <textarea id="history" rows={3} value={history} onChange={(e) => setHistory(e.target.value)}
                      placeholder="4200, 3800, 5100, 4400" className={`${field} resize-none`} />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone={parsedHistory.length >= 3 ? "info" : "plain"}>{parsedHistory.length}개년 입력</Badge>
              <span className="text-[12px] text-gov-ink3">
                {parsedHistory.length >= 3 ? "변동성을 개인화합니다" : "3개년부터 반영됩니다"}
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

        <div className="flex flex-wrap items-center gap-3">
          <Btn type="submit">저장하고 홈으로</Btn>
          <button type="button"
                  onClick={() => { clearProfile(); setPyeong(""); setHistory(""); setDebt(""); }}
                  className="text-[13px] text-gov-ink3 underline underline-offset-2 hover:text-gov-point">
            저장된 정보 지우기
          </button>
        </div>
      </form>
    </>
  );
}
