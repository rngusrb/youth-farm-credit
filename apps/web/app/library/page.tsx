"use client";

import { useFarm } from "@/lib/useFarm";
import { useEffect, useState } from "react";
import { Badge, Crumb, Notice, Page, PageTitle, Panel, Section } from "@/components/gov";
import { fetchCorpus, type CorpusDoc, fetchEligibility } from "@/lib/api";

export default function LibraryPage() {
  const [docs, setDocs] = useState<CorpusDoc[]>([]);
  const [total, setTotal] = useState(0);
  const [note, setNote] = useState("");
  const [checkedOn, setCheckedOn] = useState<string | null>(null);
  /** 내가 고른 자금의 지침이 어느 문서인지. 못 찾으면 필터를 안 그린다. */
  const { profile } = useFarm();
  const [myDoc, setMyDoc] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCorpus()
      .then((d) => { setDocs(d.documents); setTotal(d.total_chunks); setNote(d.note); setCheckedOn(d.checked_on); })
      .catch(() => setError("자료실 목록을 불러오지 못했어요. 백엔드가 실행 중인지 확인해 주세요."));
  }, []);

  useEffect(() => {
    if (!profile) return;
    fetchEligibility()
      .then((e) => {
        const hit = e.products.find((p) => p.product_id === profile.productId);
        setMyDoc(hit?.document ?? null);
      })
      .catch((err) => console.warn("자격 요건을 불러오지 못했습니다:", err));
  }, [profile]);

  const view = mineOnly && myDoc ? docs.filter((d) => d.title === myDoc) : docs;

  return (
    <Page>
      <Crumb trail={[{ label: "제도 · 자료" }, { label: "자료실" }]} />
      <PageTitle
        title="자료실"
        lead="이 서비스가 제도 요건을 안내할 때 근거로 쓰는 원문이에요. 요약본이 아니라 조항 원문 그대로를 색인해 두고, 답변마다 해당 조항을 함께 내요."
      />

      <div id="main">
        {error && <Notice tone="danger">{error}</Notice>}

        <Section title={`수록 문서 ${docs.length}종 · ${total.toLocaleString("ko-KR")}개 조항`}>
          {/* 내 자금의 지침을 못 찾으면 필터를 그리지 않는다 — 빈 필터를 두지 않는다 (UX-012) */}
          {myDoc && (
            <button onClick={() => setMineOnly((v) => !v)}
                    aria-pressed={mineOnly}
                    className={`mb-3 inline-flex min-h-11 items-center rounded-md border px-3 text-[12px] ${
                      mineOnly ? "border-gov-head bg-gov-soft font-semibold text-gov-head"
                               : "border-gov-line text-gov-ink2 hover:border-gov-link"}`}>
              내 자금의 지침만 보기
            </button>
          )}
          {/* 색인이 언제 원문과 맞춰본 것인지. 지침은 해마다 바뀐다. */}
          {checkedOn && (
            <p className="mb-3 text-[12px] text-gov-ink3">
              <span className="font-semibold">기준 시점</span> · 발행 연도는 각 문서 행에, 원문 대조는 {checkedOn} 기준이에요.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-t border-gov-ink/70 text-[14px]">
              <thead>
                <tr className="bg-gov-sunk text-left text-[12px] font-semibold text-gov-ink2">
                  <th scope="col" className="border-b border-gov-line px-4 py-3">문서명</th>
                  <th scope="col" className="border-b border-gov-line px-4 py-3">발행</th>
                  <th scope="col" className="border-b border-gov-line px-4 py-3">장</th>
                  <th scope="col" className="border-b border-gov-line px-4 py-3">조항</th>
                  <th scope="col" className="border-b border-gov-line px-4 py-3">분량</th>
                  <th scope="col" className="border-b border-gov-line px-4 py-3">원문</th>
                </tr>
              </thead>
              <tbody>
                {view.map((d) => (
                  <tr key={d.title} className="border-b border-gov-line2 align-top">
                    <td className="px-4 py-3">
                      <span className="font-medium text-gov-ink">{d.title}</span>
                      <span className="mt-1 block text-[12px] text-gov-ink3">
                        농림축산식품부 청년농육성정책팀
                      </span>
                    </td>
                    <td className="tabular px-4 py-3 text-gov-ink2">{d.year ?? "—"}</td>
                    <td className="tabular px-4 py-3 text-gov-ink2">{d.sections}</td>
                    <td className="tabular px-4 py-3 text-gov-ink2">{d.chunks.toLocaleString("ko-KR")}</td>
                    <td className="tabular px-4 py-3 text-gov-ink2">
                      {Math.round(d.chars / 1000).toLocaleString("ko-KR")}천자
                    </td>
                    <td className="px-4 py-3">
                      {d.url ? (
                        <a href={d.url} target="_blank" rel="noreferrer" className="lnk inline-flex min-h-11 items-center text-[13px]">
                          내려받기 ↗
                        </a>
                      ) : (
                        <span className="text-gov-ink3">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {note && <p className="mt-3 text-[12px] leading-relaxed text-gov-ink3">{note}</p>}
        </Section>

        <Section title="이 원문을 어떻게 쓰나">
          <div className="grid gap-px bg-gov-line sm:grid-cols-3">
            {[
              ["조항 단위로 자릅니다", "장·절·항 구조를 따라 나눕니다. 한 조각이 너무 크면 서로 다른 질문에 똑같이 걸려 둘 다 틀립니다."],
              ["질문을 지침의 말로 바꿔요", "‘이자 언제 내요’와 ‘연 1회 후취’를 잇습니다. 사용자의 말과 지침의 말이 다르니까요."],
              ["근거 없으면 답하지 않아요", "조항을 찾지 못하면 답변을 만들지 않아요. 제도를 잘못 안내하면 실제로 손해가 납니다."],
            ].map(([t, d]) => (
              <div key={t} className="bg-white p-5">
                <h3 className="text-[14px] font-bold text-gov-ink">{t}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-gov-ink2">{d}</p>
              </div>
            ))}
          </div>
        </Section>

        <Notice tone="info" title="원문 이용 안내">
          수록된 문서는 농림축산식품부가 공개한 시행지침이에요. 원문 파일은 발행처 또는
          각 지자체 농업기술센터 공고에서 내려받을 수 있으며, 이 서비스는 검색을 돕기 위해
          평문으로 색인해 두었어요. 최신본 여부는 발행처 공고를 확인해 주세요.
        </Notice>
      </div>
    </Page>
  );
}
