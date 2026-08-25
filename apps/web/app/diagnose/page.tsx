"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  extractSlots,
  fetchCrops,
  runDiagnose,
  type ExtractResult,
  type Slots,
} from "@/lib/api";
import { won } from "@/lib/format";

const EXAMPLES = [
  "부모님 하우스 물려받아서 딸기 해보려는데 1000평쯤 되고 대출 얼마나 받을 수 있나요",
  "시설토마토 2000평 하고 있고 생활비는 월 200만원, 기존 대출 상환이 연 300만원 있어요",
  "딸기 수경 3300㎡ 시작하려고 합니다. 생활비 연 2400만원 잡고 5억 받으려고요",
];

/** 후속 답변을 어느 슬롯에 대한 것인지 붙여서 보낸다 (한 번에 한 슬롯). */
const PREFIX: Record<string, string> = {
  crop_id: "",
  pyeong: "면적 ",
  living_cost: "생활비 연 ",
};

type Turn = { role: "user" | "bot"; text: string };

const EMPTY: Slots = {
  crop_id: null,
  pyeong: null,
  succession: null,
  years_farming: null,
  living_cost: null,
  other_debt_service: null,
  requested_principal: null,
  income_history: [],
};

export default function DiagnosePage() {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([
    {
      role: "bot",
      text: "어떤 작목을, 어느 정도 규모로 하실 계획인지 편하게 적어주세요. 한 문장이면 됩니다.",
    },
  ]);
  const [input, setInput] = useState("");
  const [slots, setSlots] = useState<Slots>(EMPTY);
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [cropList, setCropList] = useState<{ id: string; name: string }[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchCrops()
      .then((d) => setCropList(d.crops.map((c) => ({ id: c.id, name: c.name }))))
      .catch(() => setError("API 서버에 연결하지 못했습니다. 백엔드가 실행 중인지 확인해 주세요."));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, ready]);

  async function send(raw: string) {
    const text = raw.trim();
    if (!text || busy) return;
    setInput("");
    setError(null);
    setTurns((t) => [...t, { role: "user", text }]);
    setBusy(true);
    try {
      const prefixed = pending ? `${PREFIX[pending] ?? ""}${text}` : text;
      const result: ExtractResult = await extractSlots(prefixed, slots);
      setSlots(result.slots);
      if (result.missing_required.length > 0 && result.followup_question) {
        setPending(result.missing_required[0]);
        setTurns((t) => [...t, { role: "bot", text: result.followup_question! }]);
      } else {
        setPending(null);
        setReady(true);
        setTurns((t) => [
          ...t,
          { role: "bot", text: "확인했습니다. 아래 내용이 맞는지 봐주세요. 고치실 수 있습니다." },
        ]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!slots.crop_id || !slots.pyeong || slots.living_cost === null) return;
    setBusy(true);
    setError(null);
    try {
      const d = await runDiagnose({
        crop_id: slots.crop_id,
        pyeong: slots.pyeong,
        living_cost: slots.living_cost,
        other_debt_service: slots.other_debt_service ?? 0,
        requested_principal: slots.requested_principal,
        income_history: slots.income_history ?? [],
      });
      router.push(`/result/${d.diagnosis_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "계산에 실패했습니다.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="text-xl font-semibold tracking-tight">상환 여력 진단</h1>
      <p className="mt-2 text-sm text-slate-500">
        필요한 값은 작목 · 면적 · 연간 생활비 세 가지입니다. 나머지는 비워두셔도 됩니다.
      </p>

      <div className="mt-8 space-y-3">
        {turns.map((t, i) => (
          <div
            key={i}
            className={
              t.role === "user"
                ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-slate-100 px-4 py-2.5 text-sm text-ink-950"
                : "max-w-[85%] rounded-2xl rounded-bl-sm border border-ink-700 bg-ink-900 px-4 py-2.5 text-sm text-slate-200"
            }
          >
            {t.text}
          </div>
        ))}
        {busy && <div className="text-xs text-slate-500">계산 중…</div>}
        <div ref={endRef} />
      </div>

      {!ready && turns.length === 1 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <button
              key={e}
              onClick={() => send(e)}
              className="rounded-full border border-ink-700 px-3 py-1.5 text-left text-xs text-slate-400 transition hover:border-ink-600 hover:text-slate-200"
            >
              {e.length > 42 ? `${e.slice(0, 42)}…` : e}
            </button>
          ))}
        </div>
      )}

      <form
        className="mt-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={pending ? "답변을 입력하세요" : "예: 딸기 수경 1000평, 생활비 연 2400만원"}
          className="flex-1 rounded-lg border border-ink-700 bg-ink-900 px-4 py-3 text-sm outline-none transition placeholder:text-slate-600 focus:border-signal-calm"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-lg bg-slate-100 px-5 text-sm font-semibold text-ink-950 transition hover:bg-white disabled:opacity-40"
        >
          보내기
        </button>
      </form>

      {error && (
        <p className="mt-4 rounded-lg border border-signal-danger/40 bg-signal-danger/10 p-3 text-sm text-signal-danger">
          {error}
        </p>
      )}

      {ready && (
        <ConfirmCard
          slots={slots}
          crops={cropList}
          busy={busy}
          onChange={setSlots}
          onSubmit={submit}
        />
      )}
    </main>
  );
}

function ConfirmCard({
  slots,
  crops,
  busy,
  onChange,
  onSubmit,
}: {
  slots: Slots;
  crops: { id: string; name: string }[];
  busy: boolean;
  onChange: (s: Slots) => void;
  onSubmit: () => void;
}) {
  const set = <K extends keyof Slots>(k: K, v: Slots[K]) => onChange({ ...slots, [k]: v });
  const num = (v: string) => (v === "" ? null : Number(v.replace(/,/g, "")));

  return (
    <section className="mt-8 rounded-xl border border-ink-700 bg-ink-900 p-5">
      <h2 className="text-sm font-semibold text-slate-200">추출된 조건</h2>
      <div className="mt-4 space-y-3">
        <Row label="작목">
          <select
            value={slots.crop_id ?? ""}
            onChange={(e) => set("crop_id", e.target.value || null)}
            className="w-full rounded border border-ink-700 bg-ink-800 px-3 py-2 text-sm outline-none focus:border-signal-calm"
          >
            <option value="">선택</option>
            {crops.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Row>
        <Row label="면적 (평)">
          <NumberInput value={slots.pyeong} onChange={(v) => set("pyeong", v)} />
        </Row>
        <Row label="연간 생활비 (원)" hint={slots.living_cost ? won(slots.living_cost) : undefined}>
          <NumberInput value={slots.living_cost} onChange={(v) => set("living_cost", v)} />
        </Row>
        <Row
          label="기존 부채 연 상환액 (원)"
          hint={slots.other_debt_service ? won(slots.other_debt_service) : undefined}
        >
          <NumberInput
            value={slots.other_debt_service}
            onChange={(v) => set("other_debt_service", v)}
          />
        </Row>
        <Row
          label="희망 차입액 (원, 선택)"
          hint={slots.requested_principal ? won(slots.requested_principal) : undefined}
        >
          <NumberInput
            value={slots.requested_principal}
            onChange={(v) => set("requested_principal", v)}
          />
        </Row>
      </div>

      <IncomeHistoryField
        values={slots.income_history ?? []}
        onChange={(v) => set("income_history", v)}
      />

      <button
        onClick={onSubmit}
        disabled={busy || !slots.crop_id || !slots.pyeong || slots.living_cost === null}
        className="mt-5 w-full rounded-lg bg-slate-100 py-3 text-sm font-semibold text-ink-950 transition hover:bg-white disabled:opacity-40"
      >
        이 조건으로 계산하기
      </button>
      <p className="mt-2 text-[11px] text-slate-600">
        입력값은 서버에 저장되지 않습니다. 결과 주소에만 담겨 공유됩니다.
      </p>
    </section>
  );

  function NumberInput({
    value,
    onChange,
  }: {
    value: number | null;
    onChange: (v: number | null) => void;
  }) {
    return (
      <input
        inputMode="numeric"
        value={value ?? ""}
        onChange={(e) => onChange(num(e.target.value))}
        className="tabular w-full rounded border border-ink-700 bg-ink-800 px-3 py-2 text-sm outline-none focus:border-signal-calm"
      />
    );
  }
}

function IncomeHistoryField({
  values,
  onChange,
}: {
  values: number[];
  onChange: (v: number[]) => void;
}) {
  const [text, setText] = useState(values.join(", "));
  const parsed = text
    .split(/[,\s]+/)
    .map((t) => Number(t.replace(/[^0-9.]/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  const enough = parsed.length >= 3;

  return (
    <div className="mt-5 rounded-lg border border-ink-800 bg-ink-950/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-slate-300">
          지난 농업소득 이력 (선택)
        </span>
        <span className="text-[11px] text-slate-600">
          3개년 이상이면 변동성을 내 이력으로 계산합니다
        </span>
      </div>
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const next = e.target.value
            .split(/[,\s]+/)
            .map((t) => Number(t.replace(/[^0-9.]/g, "")))
            .filter((n) => Number.isFinite(n) && n > 0);
          onChange(next.length >= 3 ? next : []);
        }}
        placeholder="연도순으로, 쉼표로 구분 — 예: 41000000, 52000000, 46000000"
        className="tabular mt-2 w-full rounded border border-ink-700 bg-ink-800 px-3 py-2 text-sm outline-none placeholder:text-slate-600 focus:border-signal-calm"
      />
      <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
        {parsed.length === 0
          ? "비워두면 작목 평균 변동성(가정값)을 씁니다. 승계농이면 부모님 이력도 됩니다."
          : enough
            ? `${parsed.length}개년 인식 — ${parsed.map((v) => `${Math.round(v / 10000).toLocaleString("ko-KR")}만`).join(" · ")}`
            : `${parsed.length}개년만 인식됐습니다. 3개년 이상 입력해야 반영됩니다.`}
      </p>
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid grid-cols-[9rem_1fr] items-center gap-3">
      <span className="text-xs text-slate-500">
        {label}
        {hint && <span className="ml-1 block text-[11px] text-slate-600">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
