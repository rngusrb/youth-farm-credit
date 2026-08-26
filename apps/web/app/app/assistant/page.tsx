"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Badge, Notice, PageTitle, Panel } from "@/components/gov";
import {
  askRegulation, extractSlots, runDiagnose,
  type Citation, type Diagnosis,
} from "@/lib/api";
import { headlineLimit, headlineScenario } from "@/lib/diagnosis";
import { loadProfile } from "@/lib/profile";
import { pct, pyeong as fmtPyeong, ratio, won } from "@/lib/format";

/** AI 상담.
 *
 * 두 종류의 질문을 갈라 각각 다른 경로로 보낸다.
 *   "딸기 2000평이면 얼마 빌려도 되나" → 슬롯 추출 → 엔진 계산 (숫자)
 *   "거치기간 몇 년이냐"              → 지침 원문 검색 (조항)
 * **숫자는 언제나 엔진이 만든다.** 언어모델은 문장만 쓴다.
 */
type Turn =
  | { role: "user"; text: string }
  | { role: "calc"; diag: Diagnosis }
  | { role: "cite"; text: string; citations: Citation[]; confidence: string }
  | { role: "error"; text: string };

const EXAMPLES = [
  "딸기 수경 2000평 하는데 얼마까지 빌려도 되나요?",
  "재해가 나면 상환을 미룰 수 있나요?",
  "거치기간은 몇 년까지 고를 수 있나요?",
  "생활비 3천만원이면 시금치 3000평으로 버틸 수 있나요?",
];

export default function AssistantPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [turns]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setQ(""); setBusy(true);
    setTurns((t) => [...t, { role: "user", text }]);
    try {
      const profile = loadProfile();
      const slots = await extractSlots(text, {
        crop_id: profile?.cropId, pyeong: profile?.pyeong, living_cost: profile?.livingCost,
      });
      const cropId = slots.slots.crop_id ?? profile?.cropId ?? null;
      const py = slots.slots.pyeong ?? profile?.pyeong ?? null;

      if (cropId && py) {
        const diag = await runDiagnose({
          crop_id: cropId, pyeong: py,
          living_cost: slots.slots.living_cost ?? profile?.livingCost ?? 24_000_000,
          other_debt_service: profile?.otherDebtService ?? 0,
          product_id: profile?.productId ?? "successor_farmer",
        });
        setTurns((t) => [...t, { role: "calc", diag }]);
        return;
      }

      const r = await askRegulation(text);
      setTurns((t) => [...t, { role: "cite", text: r.answer, citations: r.citations, confidence: r.confidence }]);
    } catch (e) {
      setTurns((t) => [...t, { role: "error", text: e instanceof Error ? e.message : "처리에 실패했습니다." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle
        title="AI 상담"
        lead="농가 조건이 들어간 질문은 계산 엔진이 답하고, 제도 질문은 시행지침 원문에서 근거를 찾습니다. 숫자를 지어내지 않습니다."
      />

      <div className="space-y-4">
        {turns.length === 0 && (
          <Panel>
            <p className="mb-3 text-[14px] text-gov-ink2">이런 걸 물어볼 수 있습니다.</p>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((e) => (
                <button key={e} onClick={() => void send(e)}
                        className="border border-gov-line px-3 py-1.5 text-[12px] text-gov-ink2 hover:border-gov-link hover:text-gov-head">
                  {e}
                </button>
              ))}
            </div>
          </Panel>
        )}

        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[80%] bg-gov-soft px-4 py-2.5 text-[14px] text-gov-ink">{t.text}</p>
            </div>
          ) : t.role === "calc" ? (
            <Panel key={i}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge tone="info">계산 엔진</Badge>
                <span className="text-[12px] text-gov-ink3">
                  {t.diag.input.crop_name} · {fmtPyeong(t.diag.input.pyeong)} · {t.diag.product.name}
                </span>
              </div>
              <div className="grid gap-5 sm:grid-cols-3">
                {[
                  ["감당 가능한 차입", won(headlineLimit(t.diag))],
                  ["상환 가용액", won(t.diag.income.capacity)],
                  ["2년연속 위기확률", pct(headlineScenario(t.diag)?.crisis_prob ?? 0)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[12px] text-gov-ink3">{k}</div>
                    <div className="tabular mt-1 text-[20px] font-extrabold text-gov-ink">{v}</div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-gov-ink2">
                제도상 {won(t.diag.limits.available)}까지 신청할 수 있지만, 소득이 해마다
                흔들리는 것까지 넣으면 위 금액이 감당 가능한 범위입니다. DSCR 중앙값은{" "}
                {ratio(headlineScenario(t.diag)?.dscr_median ?? 0)}입니다.
              </p>
              <Link href={`/result/${t.diag.diagnosis_id}`} className="lnk mt-3 inline-block text-[13px]">
                리포트 전체 보기 →
              </Link>
            </Panel>
          ) : t.role === "cite" ? (
            <Panel key={i}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge tone={t.confidence === "none" ? "danger" : "ok"}>지침 원문</Badge>
                <span className="text-[12px] text-gov-ink3">근거 {t.citations.length}건</span>
              </div>
              <p className="text-[14px] leading-relaxed text-gov-ink">{t.text}</p>
              {t.citations.slice(0, 2).map((c, j) => (
                <figure key={j} className="mt-3 border-l-4 border-gov-line bg-gov-sunk px-4 py-3">
                  <figcaption className="mb-1.5 text-[11px] text-gov-ink3">{c.doc} · {c.section}</figcaption>
                  <blockquote className="whitespace-pre-wrap text-[12px] leading-relaxed text-gov-ink2">
                    {c.text.slice(0, 400)}{c.text.length > 400 ? "…" : ""}
                  </blockquote>
                </figure>
              ))}
              <Link href="/policy" className="lnk mt-3 inline-block text-[13px]">제도 근거에서 더 찾기 →</Link>
            </Panel>
          ) : (
            <div key={i} className="border-l-4 border-gov-point bg-gov-point/5 px-4 py-3 text-[13px] text-gov-point">
              {t.text}
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void send(q); }} className="mt-5 flex gap-2">
        <label htmlFor="ask" className="sr-only">질문</label>
        <input id="ask" value={q} onChange={(e) => setQ(e.target.value)}
               placeholder="농가 조건이나 제도 요건을 물어보세요"
               className="flex-1 border border-gov-line px-4 py-3 text-[14px] outline-none focus:border-gov-link" />
        <button type="submit" disabled={busy}
                className="shrink-0 bg-gov-head px-6 text-[14px] font-bold text-white hover:bg-gov-navy disabled:opacity-50">
          {busy ? "…" : "보내기"}
        </button>
      </form>

      <div className="mt-5">
        <Notice tone="warn" title="상담의 한계">
          제도 안내는 원문을 찾아 주는 것이지 유권해석이 아닙니다. 계산 결과는 참고자료이며
          대출 심사 결과가 아닙니다.
        </Notice>
      </div>
    </>
  );
}
