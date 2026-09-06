"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Notice, PageTitle, Panel, Stat } from "@/components/gov";
import { runDiagnose, type Diagnosis } from "@/lib/api";
import { headlineLimit, headlineScenario, unsafeGap } from "@/lib/diagnosis";
import { APPLICANTS, type Applicant } from "@/lib/applicants";
import { pct, pyeong as fmtPyeong, ratio, won } from "@/lib/format";

type Row = { a: Applicant; d: Diagnosis | null; error?: string };

/** 신청 금액이 감당 가능 범위 안인가. 판정은 엔진 숫자로만 한다. */
function verdict(a: Applicant, d: Diagnosis) {
  const safe = headlineLimit(d);
  const s = headlineScenario(d);
  if (d.limits.binding_constraint === "livelihood")
    return { tone: "danger" as const, label: "생활비도 부족", why: "무차입 상태에서도 생활비 충당이 어렵다" };
  if (a.requested <= safe)
    return { tone: "ok" as const, label: "적정", why: `신청액이 감당 범위(${won(safe)}) 안` };
  if (a.requested <= d.limits.recommended)
    return { tone: "warn" as const, label: "금액 줄이기 검토", why: `${won(a.requested - safe)} 초과 — 변동성 반영 시 기준 초과` };
  return { tone: "danger" as const, label: "과다", why: `DSCR 기준(${ratio(s?.dscr_median ?? 0)})으로도 부족` };
}

export default function ApplicantsPage() {
  const [rows, setRows] = useState<Row[]>(APPLICANTS.map((a) => ({ a, d: null })));
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all(
      APPLICANTS.map(async (a): Promise<Row> => {
        try {
          const d = await runDiagnose({
            crop_id: a.cropId, pyeong: a.pyeong, living_cost: a.livingCost,
            other_debt_service: a.otherDebtService, product_id: a.productId,
            income_history: a.incomeHistory,
          });
          return { a, d };
        } catch (e) {
          return { a, d: null, error: e instanceof Error ? e.message : "계산 실패" };
        }
      }),
    ).then((r) => { if (alive) { setRows(r); setBusy(false); } });
    return () => { alive = false; };
  }, []);

  const done = rows.filter((r) => r.d);
  const flagged = done.filter((r) => verdict(r.a, r.d!).tone !== "ok");
  const totalRequested = done.reduce((s, r) => s + r.a.requested, 0);
  const totalSafe = done.reduce((s, r) => s + headlineLimit(r.d!), 0);

  return (
    <>
      <PageTitle
        title="대출 신청자 목록"
        lead="신청자의 대출 계획을 한눈에 비교해요. 금액을 줄여 살펴볼 필요가 있는 경우도 확인할 수 있어요."
      />

      <div className="mb-5">
        <Notice tone="warn" title="예시 신원 · 실제 계산">
          서버와 신청 DB가 없어 <b>이름·지역·접수번호는 예시</b>입니다. 다만 작목·면적·부채를
          엔진에 그대로 넣어 <b>금액과 확률은 실제로 계산한 값</b>이며 조작하지 않았습니다.
          실제 서비스에서는 이 목록이 신청 데이터로 바뀝니다.
        </Notice>
      </div>

      <Panel className="mb-5">
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="접수" value={String(APPLICANTS.length)} unit="건" />
          <Stat label="검토 필요" value={busy ? "—" : String(flagged.length)} unit="건"
                tone={flagged.length ? "warn" : "ok"} />
          <Stat label="신청 합계" value={busy ? "—" : won(totalRequested)} />
          <Stat label="감당 가능 합계" value={busy ? "—" : won(totalSafe)}
                tone={totalSafe < totalRequested ? "warn" : "ok"}
                note={busy ? undefined : `차이 ${won(totalRequested - totalSafe)}`} />
        </div>
      </Panel>

      <div className="table-scroll overflow-x-auto" tabIndex={0} role="region" aria-label="표 또는 차트 상세 · 좌우로 스크롤">
        <table className="w-full min-w-[900px] border-t border-gov-ink/70 text-[13px]">
          <caption className="sr-only">심사 대기 대출 신청자 목록</caption>
          <thead>
            <tr className="bg-gov-sunk text-right text-[12px] font-semibold text-gov-ink2">
              <th scope="col" className="border-b border-gov-line px-3 py-2.5 text-left">접수 · 차주</th>
              <th scope="col" className="border-b border-gov-line px-3 py-2.5 text-left">작목 · 규모</th>
              <th scope="col" className="border-b border-gov-line px-3 py-2.5">신청액</th>
              <th scope="col" className="border-b border-gov-line px-3 py-2.5">감당 가능</th>
              <th scope="col" className="border-b border-gov-line px-3 py-2.5">DSCR</th>
              <th scope="col" className="border-b border-gov-line px-3 py-2.5">2년연속 위기</th>
              <th scope="col" className="border-b border-gov-line px-3 py-2.5 text-center">판정</th>
            </tr>
          </thead>
          <tbody className="tabular text-right">
            {rows.map(({ a, d, error }) => {
              const v = d ? verdict(a, d) : null;
              const s = d ? headlineScenario(d) : undefined;
              return (
                <tr key={a.ref} className="border-b border-gov-line2 align-top hover:bg-gov-sunk">
                  <th scope="row" className="px-3 py-3 text-left font-medium">
                    <span className="tabular block text-[12px] text-gov-ink3">{a.ref}</span>
                    <span className="text-gov-ink">{a.name}</span>
                    <span className="block text-[12px] font-normal text-gov-ink3">
                      {a.region} · {a.appliedOn}
                    </span>
                  </th>
                  <td className="px-3 py-3 text-left text-gov-ink2">
                    {d ? d.input.crop_name : "—"}
                    <span className="block text-[12px] text-gov-ink3">
                      {fmtPyeong(a.pyeong)}
                      {a.incomeHistory.length >= 3 && (
                        <span className="ml-1.5 text-gov-link">실적 {a.incomeHistory.length}개년</span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-gov-ink2">{won(a.requested)}</td>
                  <td className="px-3 py-3 font-semibold text-gov-ink">
                    {d ? won(headlineLimit(d)) : "—"}
                    {d && unsafeGap(d) > 0 && (
                      <span className="block text-[12px] font-normal text-gov-point">
                        제도한도 대비 −{won(unsafeGap(d))}
                      </span>
                    )}
                  </td>
                  <td className={`px-3 py-3 ${(s?.dscr_median ?? 9) < 1 ? "text-gov-point" : "text-gov-ink2"}`}>
                    {s ? ratio(s.dscr_median) : "—"}
                  </td>
                  <td className="px-3 py-3 text-gov-ink2">{s ? pct(s.crisis_prob) : "—"}</td>
                  <td className="px-3 py-3 text-center">
                    {error ? (
                      <span className="text-[12px] text-gov-point">{error}</span>
                    ) : v ? (
                      <>
                        <Badge tone={v.tone}>{v.label}</Badge>
                        <span className="mt-1 block text-[12px] text-gov-ink3">{v.why}</span>
                        {d && (
                          <Link href={`/result/${d.diagnosis_id}`}
                                className="lnk mt-1 inline-flex min-h-11 items-center text-[12px]">
                            심사 리포트 →
                          </Link>
                        )}
                      </>
                    ) : (
                      <span className="text-[12px] text-gov-ink3">계산 중…</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-[12px] leading-relaxed text-gov-ink3">
        판정 기준 — <b>적정</b>: 신청액이 위험기반 한도 이내 / <b>금액 줄이기 검토</b>: DSCR 기준은
        넘지만 변동성을 넣으면 초과 / <b>과다</b>: DSCR 기준으로도 부족 /
        <b> 생활비도 부족</b>: 무차입 상태에서도 생활비 충당이 어려워 감액으로 풀리지 않음.
      </p>
    </>
  );
}
