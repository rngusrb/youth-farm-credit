"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { extractSlots, fetchCrops, runDiagnose } from "@/lib/api";

type Crop = { id: string; name: string };

/** 만원 단위로 받는다. 원 단위는 자릿수가 많아 입력이 느리다. */
const MAN = 10_000;

const PRESETS = [
  { label: "딸기 수경 1,000평", crop: "strawberry_hydro", pyeong: 1000 },
  { label: "토마토 수경 2,000평", crop: "tomato_hydro", pyeong: 2000 },
  { label: "시금치 3,000평", crop: "spinach", pyeong: 3000 },
];

export default function InputPage() {
  const router = useRouter();
  const [crops, setCrops] = useState<Crop[]>([]);
  const [cropId, setCropId] = useState("");
  const [pyeong, setPyeong] = useState("");
  const [living, setLiving] = useState("2400");
  const [debt, setDebt] = useState("");
  const [want, setWant] = useState("");
  const [history, setHistory] = useState("");
  const [sentence, setSentence] = useState("");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pyeongRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchCrops()
      .then((d) => {
        setCrops(d.crops.map((c) => ({ id: c.id, name: c.name })));
        setCropId((prev) => prev || d.crops[0]?.id || "");
      })
      .catch(() => setError("서버에 연결하지 못했습니다. 백엔드가 실행 중인지 확인해 주세요."));
  }, []);

  const ready = cropId && Number(pyeong) > 0 && living !== "" && Number(living) >= 0;

  const parsedHistory = history
    .split(/[,\s]+/)
    .map((t) => Number(t.replace(/[^0-9.]/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => n * MAN);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const d = await runDiagnose({
        crop_id: cropId,
        pyeong: Number(pyeong),
        living_cost: Number(living) * MAN,
        other_debt_service: debt ? Number(debt) * MAN : 0,
        requested_principal: want ? Number(want) * MAN : null,
        income_history: parsedHistory.length >= 3 ? parsedHistory : [],
      });
      router.push(`/result/${d.diagnosis_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "계산에 실패했습니다.");
      setBusy(false);
    }
  }

  /** 문장을 붙여넣으면 칸을 채워 준다. 어디까지나 가속 장치이고, 폼이 본체다. */
  async function readSentence() {
    if (!sentence.trim() || reading) return;
    setReading(true);
    setError(null);
    try {
      const r = await extractSlots(sentence);
      const s = r.slots;
      if (s.crop_id) setCropId(s.crop_id);
      if (s.pyeong) setPyeong(String(Math.round(s.pyeong)));
      if (s.living_cost) setLiving(String(Math.round(s.living_cost / MAN)));
      if (s.other_debt_service) setDebt(String(Math.round(s.other_debt_service / MAN)));
      if (s.requested_principal) setWant(String(Math.round(s.requested_principal / MAN)));
      if (!s.crop_id && !s.pyeong && !s.living_cost) {
        setError("문장에서 읽어낼 값을 찾지 못했습니다. 아래 칸에 직접 넣어주세요.");
      }
    } catch {
      setError("문장 해석에 실패했습니다. 아래 칸에 직접 넣어주세요.");
    } finally {
      setReading(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-5 py-12 sm:py-16">
      <h1 className="text-2xl font-bold tracking-tight text-slate-50">
        상환여력 진단
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">
        정책자금을 신청하기 전에, 감당할 수 있는 차입 규모를 계산합니다.
        필요한 값은 <b className="text-slate-200">작목 · 면적 · 생활비</b> 세 개입니다.
      </p>

      {/* 빠른 시작 */}
      <div className="mt-6 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => {
              setCropId(p.crop);
              setPyeong(String(p.pyeong));
              pyeongRef.current?.focus();
            }}
            className="rounded-full border border-ink-700 px-3 py-1.5 text-xs text-slate-400 transition hover:border-ink-600 hover:text-slate-200"
          >
            {p.label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-8 space-y-5">
        <Field label="작목" required>
          <select
            value={cropId}
            onChange={(e) => setCropId(e.target.value)}
            className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-signal-warn"
          >
            {crops.length === 0 && <option value="">불러오는 중…</option>}
            {crops.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="재배 면적" required unit="평">
          <NumberInput
            ref={pyeongRef}
            value={pyeong}
            onChange={setPyeong}
            placeholder="1000"
            autoFocus
          />
        </Field>

        <Field label="연간 생활비" required unit="만원" hint="가구 전체 기준">
          <NumberInput value={living} onChange={setLiving} placeholder="2400" />
        </Field>

        <details className="group rounded-lg border border-ink-800 bg-ink-900/40">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm text-slate-400 transition hover:text-slate-200">
            <span className="mr-2 inline-block transition group-open:rotate-90">›</span>
            선택 입력 — 기존 부채 · 희망 차입액 · 소득 이력
          </summary>
          <div className="space-y-5 border-t border-ink-800 px-4 py-5">
            <Field label="기존 부채 연 상환액" unit="만원">
              <NumberInput value={debt} onChange={setDebt} placeholder="0" />
            </Field>
            <Field label="희망 차입액" unit="만원" hint="비우면 제도 한도로 계산">
              <NumberInput value={want} onChange={setWant} placeholder="50000" />
            </Field>
            <Field
              label="지난 농업소득 이력"
              unit="만원"
              hint={
                parsedHistory.length >= 3
                  ? `${parsedHistory.length}개년 인식 — 변동성을 내 이력으로 계산합니다`
                  : "3개년 이상, 연도순 쉼표 구분. 승계농은 부모님 이력도 됩니다"
              }
            >
              <input
                value={history}
                onChange={(e) => setHistory(e.target.value)}
                placeholder="4100, 5200, 4600, 5800"
                className="tabular w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-signal-warn"
              />
            </Field>
          </div>
        </details>

        <button
          type="submit"
          disabled={!ready || busy}
          className="w-full rounded-lg bg-slate-100 py-3.5 text-sm font-semibold text-ink-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "계산하는 중…" : "진단 리포트 보기"}
        </button>
      </form>

      {error && (
        <p className="mt-4 rounded-lg border border-signal-danger/40 bg-signal-danger/10 p-3 text-sm text-signal-danger">
          {error}
        </p>
      )}

      {/* 문장 붙여넣기 — 보조 수단 */}
      <div className="mt-10 border-t border-ink-800 pt-6">
        <label className="text-xs text-slate-500">
          문장으로 붙여넣어 한 번에 채우기
        </label>
        <div className="mt-2 flex gap-2">
          <input
            value={sentence}
            onChange={(e) => setSentence(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                readSentence();
              }
            }}
            placeholder="딸기 수경 1000평, 생활비 연 2400만원"
            className="flex-1 rounded-lg border border-ink-800 bg-ink-900/60 px-3 py-2 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-ink-600"
          />
          <button
            type="button"
            onClick={readSentence}
            disabled={reading || !sentence.trim()}
            className="rounded-lg border border-ink-700 px-4 text-sm text-slate-300 transition hover:border-ink-600 disabled:opacity-40"
          >
            {reading ? "읽는 중" : "읽기"}
          </button>
        </div>
      </div>

      <p className="mt-8 text-xs leading-relaxed text-slate-600">
        입력값은 서버에 저장되지 않습니다. 결과는 주소에만 담겨 공유됩니다.
        부도 예측·신용평가·대출 알선을 하지 않으며, 계산 결과는 대출 심사 결과가
        아닙니다.
      </p>
    </main>
  );
}

function Field({
  label,
  unit,
  hint,
  required,
  children,
}: {
  label: string;
  unit?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline gap-1.5 text-xs text-slate-400">
        {label}
        {required && <span className="text-signal-warn">*</span>}
        {unit && <span className="ml-auto text-slate-600">{unit}</span>}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1 block text-[11px] text-slate-600">{hint}</span>}
    </label>
  );
}

const NumberInput = ({
  ref,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  ref?: React.Ref<HTMLInputElement>;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) => (
  <input
    ref={ref}
    inputMode="numeric"
    autoFocus={autoFocus}
    value={value}
    onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
    placeholder={placeholder}
    className="tabular w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-signal-warn"
  />
);
