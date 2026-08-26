"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shell/PageHeader";
import Disclaimer from "@/components/shell/Disclaimer";
import { Card, CardTitle, Page, Pill } from "@/components/ui";
import { fetchCrops, fetchProducts, type CropRow, type ProductRow } from "@/lib/api";
import { clearProfile, loadProfile, saveProfile } from "@/lib/profile";
import { won } from "@/lib/format";

const MAN = 10_000;

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
  const [saved, setSaved] = useState(false);
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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!cropId || !Number(pyeong)) {
      setError("작목과 재배 면적은 반드시 필요합니다.");
      return;
    }
    saveProfile({
      cropId,
      productId,
      pyeong: Number(pyeong),
      livingCost: Number(living || 0) * MAN,
      otherDebtService: Number(debt || 0) * MAN,
      incomeHistory: parsedHistory,
    });
    setSaved(true);
    setError(null);
    router.push("/");
  }

  const field =
    "w-full rounded-lg border border-ink-700 bg-ink-900 px-3.5 py-2.5 text-sm outline-none transition focus:border-signal-warn";
  const label = "mb-1.5 block text-xs font-medium text-slate-400";

  return (
    <Page>
      <PageHeader
        title="내 농가"
        lead="한 번 넣어 두면 대시보드가 이 값으로 매번 다시 계산합니다. 로그인이 없고 서버로 보내지 않으며, 이 브라우저에만 남습니다."
      />

      {error && (
        <div className="mb-5 rounded-lg border border-signal-danger/40 bg-signal-danger/10 px-4 py-3 text-sm text-signal-danger">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle>경영 정보</CardTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={label} htmlFor="crop">작목</label>
              <select id="crop" value={cropId} onChange={(e) => setCropId(e.target.value)} className={field}>
                {crops.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · 10a당 {won(c.income_per_10a)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="pyeong">재배 면적 (평)</label>
              <input id="pyeong" inputMode="numeric" value={pyeong} onChange={(e) => setPyeong(e.target.value)} placeholder="3000" className={field} />
            </div>
            <div>
              <label className={label} htmlFor="living">연 생활비 (만원)</label>
              <input id="living" inputMode="numeric" value={living} onChange={(e) => setLiving(e.target.value)} className={field} />
            </div>
            <div>
              <label className={label} htmlFor="debt">기존 연 부채상환 (만원)</label>
              <input id="debt" inputMode="numeric" value={debt} onChange={(e) => setDebt(e.target.value)} placeholder="없으면 비워 두세요" className={field} />
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
        </Card>

        <Card>
          <CardTitle>소득 이력 (선택)</CardTitle>
          <p className="mb-3 text-xs leading-relaxed text-slate-500">
            연도순 농업소득을 만원 단위로, 쉼표로 구분해 넣습니다. 3개년 이상이면 작목 평균
            대신 <b className="text-slate-300">내 농가의 실제 변동성</b>으로 계산합니다.
          </p>
          <textarea
            value={history}
            onChange={(e) => setHistory(e.target.value)}
            rows={4}
            placeholder="4200, 3800, 5100, 4400"
            className={`${field} resize-none`}
          />
          <div className="mt-3 flex items-center gap-2">
            <Pill tone={parsedHistory.length >= 3 ? "info" : "plain"}>
              {parsedHistory.length}개년 입력
            </Pill>
            <span className="text-[11px] text-slate-600">
              {parsedHistory.length >= 3 ? "σ 를 개인화합니다" : "3개년부터 반영됩니다"}
            </span>
          </div>
          {crop && (
            <p className="mt-4 border-t border-ink-800 pt-3 text-[11px] leading-relaxed text-slate-600">
              {crop.name}의 작목 평균 σ 는 {crop.sigma.toFixed(3)}
              {crop.sigma_n ? ` (KOSIS ${crop.sigma_n}개년 실측)` : ""} 입니다.
            </p>
          )}
        </Card>

        <div className="flex items-center gap-3 lg:col-span-3">
          <button
            type="submit"
            className="rounded-lg bg-signal-warn px-5 py-2.5 text-sm font-semibold text-ink-950 transition hover:brightness-110"
          >
            저장하고 대시보드로
          </button>
          <button
            type="button"
            onClick={() => {
              clearProfile();
              setSaved(false);
              router.refresh();
              setPyeong("");
              setHistory("");
            }}
            className="text-sm text-slate-500 transition hover:text-slate-300"
          >
            저장된 정보 지우기
          </button>
          {saved && <span className="text-xs text-signal-ok">저장했습니다</span>}
        </div>
      </form>

      <Disclaimer />
    </Page>
  );
}
