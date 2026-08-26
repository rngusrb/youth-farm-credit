"use client";

import { useState } from "react";
import { Badge, Crumb, Notice, Page, PageTitle, Panel } from "@/components/gov";
import { askRegulation, type RegulationAnswer } from "@/lib/api";

/** 자주 묻는 질문.
 *
 * 답을 미리 적어 두지 않는다. 누르면 그 자리에서 지침 원문을 검색해 조항을
 * 함께 낸다 — 지침이 개정되면 답도 같이 바뀌어야 하기 때문이다.
 */
const GROUPS: { label: string; questions: string[] }[] = [
  {
    label: "지원 자격",
    questions: [
      "지원 자격 나이 제한",
      "영농경력이 얼마나 되어야 신청할 수 있나",
      "직장에 다니면서 신청할 수 있나",
    ],
  },
  {
    label: "융자 조건",
    questions: [
      "융자 한도는 얼마인가",
      "대출금리는 몇 퍼센트인가",
      "거치기간은 최대 몇 년까지 선택할 수 있나",
      "상환 방식은 어떻게 되나",
      "이자는 언제 내나",
    ],
  },
  {
    label: "의무와 제재",
    questions: [
      "의무영농기간을 어기면 어떻게 되나",
      "자금을 목적 외로 쓰면 어떻게 되나",
    ],
  },
  {
    label: "위기 대응",
    questions: [
      "재해로 피해를 입으면 상환을 연기할 수 있나",
      "농신보 보증은 얼마까지 되나",
    ],
  },
];

export default function FaqPage() {
  const [open, setOpen] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, RegulationAnswer | "loading" | "error">>({});

  async function toggle(q: string) {
    if (open === q) { setOpen(null); return; }
    setOpen(q);
    if (answers[q] && answers[q] !== "error") return;
    setAnswers((a) => ({ ...a, [q]: "loading" }));
    try {
      const r = await askRegulation(q);
      setAnswers((a) => ({ ...a, [q]: r }));
    } catch {
      setAnswers((a) => ({ ...a, [q]: "error" }));
    }
  }

  return (
    <Page>
      <Crumb trail={[{ label: "제도 · 자료" }, { label: "자주 묻는 질문" }]} />
      <PageTitle
        title="자주 묻는 질문"
        lead="답을 미리 적어 두지 않습니다. 질문을 누르면 그 자리에서 2026년 시행지침 원문을 찾아 해당 조항을 함께 보여 드립니다."
      />

      <div id="main" className="space-y-7">
        {GROUPS.map((g) => (
          <section key={g.label}>
            <h2 className="sec-title mb-3">{g.label}</h2>
            <ul className="border-t border-gov-ink/70">
              {g.questions.map((q) => {
                const a = answers[q];
                const isOpen = open === q;
                return (
                  <li key={q} className="border-b border-gov-line2">
                    <button
                      onClick={() => void toggle(q)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center gap-3 px-1 py-3.5 text-left hover:bg-gov-sunk"
                    >
                      <span className="font-bold text-gov-link" aria-hidden>Q</span>
                      <span className="flex-1 text-[14px] text-gov-ink">{q}</span>
                      <span aria-hidden className="text-gov-ink3">{isOpen ? "−" : "+"}</span>
                    </button>
                    {isOpen && (
                      <div className="border-t border-gov-line2 bg-gov-sunk px-4 py-4">
                        {a === "loading" && <p className="text-[13px] text-gov-ink3">원문에서 찾는 중…</p>}
                        {a === "error" && (
                          <p className="text-[13px] text-gov-point">
                            검색에 실패했습니다. 백엔드가 실행 중인지 확인해 주세요.
                          </p>
                        )}
                        {a && a !== "loading" && a !== "error" && (
                          <>
                            <p className="text-[14px] leading-relaxed text-gov-ink">{a.answer}</p>
                            {a.citations.slice(0, 2).map((c, i) => (
                              <figure key={i} className="mt-3 border-l-4 border-gov-line bg-white px-4 py-3">
                                <figcaption className="mb-1.5 flex flex-wrap items-center gap-2 text-[12px] text-gov-ink3">
                                  <Badge tone="info">{c.section}</Badge>
                                  <span>{c.doc}</span>
                                </figcaption>
                                <blockquote className="whitespace-pre-wrap text-[12px] leading-relaxed text-gov-ink2">
                                  {c.text.slice(0, 500)}{c.text.length > 500 ? "…" : ""}
                                </blockquote>
                              </figure>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <Notice tone="warn" title="안내의 한계">
          검색 결과는 지침 원문을 찾아 주는 것이지 유권해석이 아닙니다. 자격·의무·환수처럼
          불이익이 걸린 사항은 반드시 관할 시·군·구 담당자에게 확인하시기 바랍니다.
        </Notice>
      </div>
    </Page>
  );
}
