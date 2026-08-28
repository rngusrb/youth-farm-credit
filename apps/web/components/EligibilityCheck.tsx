"use client";

import { useState } from "react";
import type { ProductEligibility, Requirement } from "@/lib/api";
import Fold from "./Fold";

/**
 * 정책자금 자격 **자가진단** (UX-012).
 *
 * 판정하지 않는다. 자격을 잘못 판정하면 실제로는 받을 수 있는 사람이 포기한다.
 * 그래서 여기서 하는 일은 셋뿐이다:
 *   ① 시행지침 요건을 조문 원문과 함께 보여준다
 *   ② 농가가 답한 것에 대해서만 "…해당하지 않을 수 있어요" 라고 **의견**을 낸다
 *   ③ 최종 판단이 시행기관에 있다는 것을 매번 붙인다
 *
 * 요건 목록은 API 가 코퍼스에서 끌어온다 — 조문을 못 찾은 요건은 애초에 안 온다.
 */
type Answer = "yes" | "no" | null;

export default function EligibilityCheck({
  data,
  note,
}: {
  data: ProductEligibility[];
  note: string;
}) {
  const [age, setAge] = useState("");
  const [career, setCareer] = useState("");
  const [self, setSelf] = useState<Record<string, Answer>>({});
  /** 종합에서 「원문 펴기」 를 누른 요건. 그 행의 접힘을 연다. */
  const [opened, setOpened] = useState<string | null>(null);

  if (!data.length) return null;

  return (
    <div className="space-y-5">
      <p className="text-[13px] leading-relaxed text-gov-ink2">
        아래는 시행지침이 정한 요건이에요. 답하신 것에 대해서만 저희 의견을 붙여
        드려요 — 최종 판단은 사업 시행기관(시·군·구)에 있어요.
      </p>

      <div className="flex flex-wrap gap-4 rounded-lg border border-gov-line bg-gov-sunk px-4 py-3.5">
        <Field label="나이" unit="세" value={age} onChange={setAge} />
        <Field label="영농경력" unit="년" value={career} onChange={setCareer} />
      </div>

      {data.map((p) => (
        <section key={p.product_id} className="rounded-xl border border-gov-line bg-white">
          <header className="border-b border-gov-line2 px-5 py-3.5">
            <h3 className="text-[15px] font-bold text-gov-ink">{p.product_name}</h3>
            {p.document && (
              <p className="mt-0.5 text-[12px] text-gov-ink3">{p.document}</p>
            )}
          </header>
          <Summary
            t={tally(p.requirements, { age, career, self }, (r) => `${p.product_id}:${r.key}`)}
            onOpen={setOpened}
          />
          <ul>
            {p.requirements.map((r) => (
              <Row
                key={r.key}
                req={r}
                open={opened === `${p.product_id}:${r.key}`}
                verdict={verdictFor(r, { age, career, self: self[`${p.product_id}:${r.key}`] ?? null })}
                answer={self[`${p.product_id}:${r.key}`] ?? null}
                onAnswer={(a) =>
                  setSelf((s) => ({ ...s, [`${p.product_id}:${r.key}`]: a }))
                }
              />
            ))}
          </ul>
        </section>
      ))}

      <p className="text-[12px] leading-relaxed text-gov-ink3">{note}</p>
    </div>
  );
}

/** 화면이 내는 것은 판정이 아니라 세 가지 상태뿐이다. */
type Verdict = { tone: "ok" | "warn" | "none"; text: string };

export function verdictFor(
  r: Requirement,
  input: { age: string; career: string; self: Answer },
): Verdict {
  const NONE: Verdict = { tone: "none", text: "답하시면 의견을 붙여 드려요" };

  if (r.check === "age_range") {
    const n = num(input.age);
    if (!Number.isFinite(n)) return NONE;
    const lo = r.min ?? -Infinity;
    const hi = r.max ?? Infinity;
    return n >= lo && n <= hi
      ? { tone: "ok", text: `${r.section} 기준 범위 안이에요` }
      : { tone: "warn", text: `${r.section} 기준으로는 해당하지 않을 수 있어요` };
  }

  if (r.check === "career_max") {
    const n = num(input.career);
    if (!Number.isFinite(n)) return NONE;
    const hi = r.max ?? Infinity;
    return n < hi
      ? { tone: "ok", text: `${r.section} 기준 범위 안이에요` }
      : { tone: "warn", text: `${r.section} 기준으로는 해당하지 않을 수 있어요` };
  }

  if (input.self === "yes") return { tone: "ok", text: "충족한다고 답하셨어요" };
  if (input.self === "no")
    return { tone: "warn", text: `${r.section} 기준으로는 해당하지 않을 수 있어요` };
  return NONE;
}

/** 빈 문자열을 0 으로 읽지 않는다 — 안 답한 것과 0 은 다르다. */
function num(v: string): number {
  return v.trim() === "" ? NaN : Number(v);
}


/** 답한 것만 센다. 안 답한 것을 어느 쪽으로도 넣지 않는다 (UX-016). */
export type Tally = {
  inRange: number;
  flagged: { key: string; label: string; section: string }[];
  unanswered: number;
  answered: number;
  total: number;
};

export function tally(
  reqs: Requirement[],
  input: { age: string; career: string; self: Record<string, Answer> },
  keyOf: (r: Requirement) => string,
): Tally {
  let inRange = 0, unanswered = 0;
  const flagged: { key: string; label: string; section: string }[] = [];
  for (const r of reqs) {
    const v = verdictFor(r, { age: input.age, career: input.career, self: input.self[keyOf(r)] ?? null });
    if (v.tone === "ok") inRange += 1;
    else if (v.tone === "warn") flagged.push({ key: keyOf(r), label: r.label, section: r.section });
    else unanswered += 1;
  }
  return { inRange, flagged, unanswered, answered: reqs.length - unanswered, total: reqs.length };
}


/**
 * 종합 — **세기만 한다.** "자격이 있다/없다" 라고 말하지 않는다.
 * 안 답한 항목은 따로 센다: 6개 중 2개만 답했는데 "5개 범위 안" 이라고 하면 거짓이다.
 */
function Summary({ t, onOpen }: { t: Tally; onOpen: (key: string) => void }) {
  if (t.answered === 0) return null;   // 하나도 안 답하면 종합이 없다

  return (
    <div className="border-b border-gov-line2 bg-gov-sunk px-5 py-4">
      <p className="text-[14px] leading-relaxed text-gov-ink">
        답하신 <b>{t.answered}개</b> 중{" "}
        <b className="text-gov-ok2">{t.inRange}개</b>는 기준 범위 안이에요.
        {t.flagged.length > 0 && (
          <>
            {" "}
            <b className="text-gov-warn2">{t.flagged.length}개</b>는 해당하지 않을 수 있어요.
          </>
        )}
        {t.unanswered > 0 && (
          <span className="text-gov-ink3"> 아직 안 답하신 것 {t.unanswered}개.</span>
        )}
      </p>

      {t.flagged.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
          {t.flagged.map((f) => (
            <li key={f.section}>
              {/* 조항은 이미 손에 있다. RAG 로 다시 찾게 하지 않는다 —
                  실측: "교육실적" 검색이 엉뚱한 Ⅲ-라 를 낸다. 그 자리에서 편다. */}
              <button
                type="button"
                onClick={() => onOpen(f.key)}
                className="lnk inline-flex min-h-11 items-center"
              >
                {f.label} ({f.section}) 원문 펴기 →
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-1.5 text-[12px] text-gov-ink3">
        요건 확인과 최종 판단은 사업 시행기관(시·군·구)에서 해요.
      </p>
    </div>
  );
}

function Row({
  req,
  verdict,
  answer,
  onAnswer,
  open,
}: {
  req: Requirement;
  verdict: Verdict;
  answer: Answer;
  onAnswer: (a: Answer) => void;
  /** 종합에서 지목되면 원문을 펴 둔다. */
  open?: boolean;
}) {
  const tone = {
    ok: "border-gov-ok2/35 bg-gov-okbg text-gov-ok2",
    warn: "border-gov-warn2/40 bg-gov-warnbg text-gov-warn2",
    none: "border-gov-line bg-gov-sunk text-gov-ink3",
  }[verdict.tone];

  return (
    <li className="border-b border-gov-line2 px-5 py-4 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[14px] font-semibold text-gov-ink">{req.label}</span>
        <span className={`rounded-sm border px-1.5 py-px text-[12px] font-medium ${tone}`}>
          {verdict.text}
        </span>
        {req.check === "self" && (
          <span className="ml-auto flex gap-1.5">
            {(["yes", "no"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={answer === v}
                onClick={() => onAnswer(answer === v ? null : v)}
                className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border px-3 text-[13px] ${
                  answer === v
                    ? "border-gov-head bg-gov-soft font-semibold text-gov-head"
                    : "border-gov-line text-gov-ink2 hover:border-gov-link"
                }`}
              >
                {v === "yes" ? "충족" : "미충족"}
              </button>
            ))}
          </span>
        )}
      </div>

      <Fold tone="gov" summary={`근거 조항 ${req.section}`} hint="원문 보기" className="mt-3" open={open}>
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-gov-ink2">
          {req.quote}
          {req.quote_truncated && <span className="text-gov-ink3"> …(이하 생략)</span>}
        </p>
        <p className="mt-2 text-[12px] text-gov-ink3">
          {req.document}
          {req.source_url && (
            <>
              {" · "}
              <a
                href={req.source_url}
                target="_blank"
                rel="noreferrer"
                className="lnk inline-flex min-h-11 items-center"
              >
                원문 내려받기 ↗
              </a>
            </>
          )}
        </p>
      </Fold>
    </li>
  );
}

function Field({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-gov-ink2">
      <span className="font-medium">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="tabular h-11 w-20 rounded-md border border-gov-line px-2 text-right text-gov-ink"
      />
      <span className="text-gov-ink3">{unit}</span>
    </label>
  );
}
