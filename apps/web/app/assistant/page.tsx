"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/shell/PageHeader";
import Disclaimer from "@/components/shell/Disclaimer";
import { Card, Page, Pill } from "@/components/ui";
import {
  askRegulation,
  extractSlots,
  runDiagnose,
  type Citation,
  type Diagnosis,
} from "@/lib/api";
import { headlineLimit, headlineScenario } from "@/lib/diagnosis";
import { loadProfile } from "@/lib/profile";
import { pct, pyeong as fmtPyeong, ratio, won } from "@/lib/format";

/** AI 상담.
 *
 * 두 가지 질문을 구분해서 각각 다른 경로로 보낸다.
 *   "딸기 2000평이면 얼마 빌려도 되나" → 슬롯 추출 → 엔진 계산 (숫자)
 *   "거치기간 몇 년이냐"              → 지침 원문 검색 (조항)
 * **숫자는 언제나 엔진이 만든다.** LLM 은 문장만 쓴다. 키가 없으면 규칙기반으로
 * 내려가고, 그 사실을 화면에 그대로 표시한다.
 */
type Turn =
  | { role: "user"; text: string }
  | { role: "calc"; text: string; diag: Diagnosis }
  | { role: "cite"; text: string; citations: Citation[]; confidence: string }
  | { role: "error"; text: string };

const EXAMPLES = [
  "딸기 수경 2000평 하는데 얼마까지 빌려도 되나요?",
  "재해가 나면 상환을 미룰 수 있나요?",
  "생활비 3천만원이면 시금치 3000평으로 버틸 수 있나요?",
  "거치기간은 몇 년까지 고를 수 있나요?",
];

export default function AssistantPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [turns]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setQ("");
    setBusy(true);
    setTurns((t) => [...t, { role: "user", text }]);

    try {
      // 1) 농가 조건이 말에 들어 있으면 계산 질문으로 본다.
      const profile = loadProfile();
      const slots = await extractSlots(text, {
        crop_id: profile?.cropId,
        pyeong: profile?.pyeong,
        living_cost: profile?.livingCost,
      });
      const cropId = slots.slots.crop_id ?? profile?.cropId ?? null;
      const py = slots.slots.pyeong ?? profile?.pyeong ?? null;

      if (cropId && py) {
        const diag = await runDiagnose({
          crop_id: cropId,
          pyeong: py,
          living_cost: slots.slots.living_cost ?? profile?.livingCost ?? 24_000_000,
          other_debt_service: profile?.otherDebtService ?? 0,
          product_id: profile?.productId ?? "successor_farmer",
        });
        setTurns((t) => [
          ...t,
          { role: "calc", text: "엔진 계산 결과입니다.", diag },
        ]);
        return;
      }

      // 2) 아니면 제도 질문으로 보고 지침 원문을 찾는다.
      const r = await askRegulation(text);
      setTurns((t) => [
        ...t,
        { role: "cite", text: r.answer, citations: r.citations, confidence: r.confidence },
      ]);
    } catch (e) {
      setTurns((t) => [
        ...t,
        { role: "error", text: e instanceof Error ? e.message : "처리에 실패했습니다." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <PageHeader
        title="AI 상담"
        lead="농가 조건이 들어간 질문은 엔진이 계산하고, 제도 질문은 시행지침 원문에서 근거를 찾습니다. 숫자를 지어내지 않습니다."
      />

      <div className="space-y-4">
        {turns.length === 0 && (
          <Card>
            <p className="mb-3 text-sm text-slate-400">이런 걸 물어볼 수 있습니다.</p>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((e) => (
                <button
                  key={e}
                  onClick={() => void send(e)}
                  className="rounded-full border border-ink-700 px-3 py-1.5 text-[11px] text-slate-400 transition hover:border-ink-600 hover:text-slate-200"
                >
                  {e}
                </button>
              ))}
            </div>
          </Card>
        )}

        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[80%] rounded-2xl rounded-br-sm bg-ink-800 px-4 py-2.5 text-sm">
                {t.text}
              </p>
            </div>
          ) : t.role === "calc" ? (
            <Card key={i}>
              <div className="mb-3 flex items-center gap-2">
                <Pill tone="info">엔진 계산</Pill>
                <span className="text-[11px] text-slate-600">
                  {t.diag.input.crop_name} · {fmtPyeong(t.diag.input.pyeong)} · {t.diag.product.name}
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  ["감당 가능한 차입", won(headlineLimit(t.diag))],
                  ["상환 가용액", won(t.diag.income.capacity)],
                  ["2년연속 위기확률", pct(headlineScenario(t.diag)?.crisis_prob ?? 0)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[11px] text-slate-500">{k}</div>
                    <div className="tabular mt-1 text-xl font-semibold">{v}</div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                제도상 {won(t.diag.limits.available)} 까지 신청할 수 있지만, 소득이 해마다 흔들리는
                것까지 넣으면 위 금액이 감당 가능한 범위입니다. DSCR 중앙값은{" "}
                {ratio(headlineScenario(t.diag)?.dscr_median ?? 0)}
                입니다.
              </p>
              <Link
                href={`/result/${t.diag.diagnosis_id}`}
                className="mt-3 inline-block text-xs text-signal-warn hover:underline"
              >
                리포트 전체 보기 →
              </Link>
            </Card>
          ) : t.role === "cite" ? (
            <Card key={i}>
              <div className="mb-3 flex items-center gap-2">
                <Pill tone={t.confidence === "none" ? "danger" : "ok"}>지침 원문</Pill>
                <span className="text-[11px] text-slate-600">근거 {t.citations.length}건</span>
              </div>
              <p className="text-sm leading-relaxed text-slate-200">{t.text}</p>
              {t.citations.slice(0, 2).map((c, j) => (
                <div key={j} className="mt-3 rounded-lg border border-ink-800 bg-ink-950/50 p-3">
                  <div className="mb-1.5 text-[11px] text-slate-500">
                    {c.doc} · {c.section}
                  </div>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-400">
                    {c.text.slice(0, 400)}
                    {c.text.length > 400 ? "…" : ""}
                  </p>
                </div>
              ))}
              <Link href="/policy" className="mt-3 inline-block text-xs text-signal-warn hover:underline">
                제도 근거에서 더 찾기 →
              </Link>
            </Card>
          ) : (
            <div
              key={i}
              className="rounded-lg border border-signal-danger/40 bg-signal-danger/10 px-4 py-3 text-sm text-signal-danger"
            >
              {t.text}
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(q);
        }}
        className="sticky bottom-16 mt-5 flex gap-2 lg:bottom-4"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="농가 조건이나 제도 요건을 물어보세요"
          className="flex-1 rounded-lg border border-ink-700 bg-ink-900 px-4 py-3 text-sm outline-none transition placeholder:text-slate-600 focus:border-signal-warn"
        />
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded-lg bg-signal-warn px-5 text-sm font-semibold text-ink-950 transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "…" : "보내기"}
        </button>
      </form>

      <Disclaimer />
    </Page>
  );
}
