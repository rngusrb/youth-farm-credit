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
          <ul>
            {p.requirements.map((r) => (
              <Row
                key={r.key}
                req={r}
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

function Row({
  req,
  verdict,
  answer,
  onAnswer,
}: {
  req: Requirement;
  verdict: Verdict;
  answer: Answer;
  onAnswer: (a: Answer) => void;
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

      <Fold tone="gov" summary={`근거 조항 ${req.section}`} hint="원문 보기" className="mt-3">
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
