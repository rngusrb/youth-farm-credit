"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { runDiagnose, type Diagnosis, type ProductRow } from "@/lib/api";
import type { FarmProfile } from "@/lib/profile";
import { pct, won } from "@/lib/format";
import Fold from "./Fold";

/**
 * 「왜 이 조건인가」 (UX-014).
 *
 * 팀원 요청: "그냥 정책자금 추천보다는 조건에 해당해서 추천, 이런 식".
 *
 * **추천하지 않는다.** 이 서비스는 대출 알선·상품 추천을 하지 않는다고 선언했다
 * (CLAUDE.md). 어느 쪽이 유리하다는 판정도 하지 않는다 (화법 규칙 2).
 * 하는 일은 **고른 근거를 보여주는 것**뿐이다:
 *   ① 이 자금의 제도 조건과 근거 조항
 *   ② 같은 금액을 다른 자금으로 받으면 무엇이 달라지는지 — 숫자는 엔진이 낸다
 *
 * 비교값은 상품마다 `runDiagnose` 를 따로 돌려 받는다. 화면은 곱하거나 나누지 않는다.
 */
type Row = { product: ProductRow; diag: Diagnosis | null; failed: boolean };

export default function WhyThisLoan({
  profile,
  current,
  others,
  principal,
}: {
  profile: FarmProfile;
  current: ProductRow;
  others: ProductRow[];
  /** 비교 기준 금액. 같은 금액이어야 조건 차이만 남는다. */
  principal: number;
}) {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let alive = true;
    const all = [current, ...others];
    Promise.all(
      all.map((p) =>
        runDiagnose({
          crop_id: profile.cropId,
          pyeong: profile.pyeong,
          living_cost: profile.livingCost,
          other_debt_service: profile.otherDebtService,
          income_history: profile.incomeHistory,
          product_id: p.id,
          requested_principal: principal,
        })
          .then((d) => ({ product: p, diag: d, failed: false }))
          .catch((err) => {
            // 조용히 빈 칸으로 두지 않는다 — 못 받아온 사실을 화면에도 남긴다.
            console.warn(`${p.name} 비교 계산 실패:`, err);
            return { product: p, diag: null, failed: true };
          }),
      ),
    ).then((r) => {
      if (alive) setRows(r);
    });
    return () => {
      alive = false;
    };
  }, [profile, current, others, principal]);

  if (!rows.length) {
    return <p className="text-[13px] text-gov-ink3">다른 자금과 비교하는 중이에요.</p>;
  }

  const grace = current.grace_years;

  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-relaxed text-gov-ink2">
        지금 <b className="text-gov-ink">{current.name}</b> 기준으로 계산하고 있어요.
        같은 <b className="tabular text-gov-ink">{won(principal)}</b>을 다른 자금으로
        받으면 무엇이 달라지는지 아래에 뒀어요 — 어느 쪽이 낫다고는 말하지 않아요.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[580px] border-t border-gov-ink/70 text-[14px]">
          <caption className="sr-only">
            같은 금액을 각 자금으로 받았을 때의 조건과 결과. 값은 모두 엔진 계산 결과입니다.
          </caption>
          <thead>
            <tr className="bg-gov-sunk text-right text-[12px] font-semibold text-gov-ink2">
              <th scope="col" className="border-b border-gov-line px-4 py-3 text-left">자금</th>
              <th scope="col" className="border-b border-gov-line px-4 py-3">한도</th>
              <th scope="col" className="border-b border-gov-line px-4 py-3">거치·상환</th>
              <th scope="col" className="border-b border-gov-line px-4 py-3">{grace + 1}년차 상환액</th>
              <th scope="col" className="border-b border-gov-line px-4 py-3">2년 연속 위기</th>
            </tr>
          </thead>
          <tbody className="tabular text-right">
            {rows.map(({ product, diag, failed }) => {
              const s = diag?.scenarios.at_requested;
              const now = product.id === current.id;
              const overLimit = principal > product.limit;
              return (
                <tr key={product.id}
                    className={`border-b border-gov-line2 ${now ? "bg-gov-soft/50" : ""}`}>
                  <th scope="row" className="px-4 py-3 text-left font-medium text-gov-ink">
                    {product.name}
                    {now && (
                      <span className="ml-1.5 rounded-sm border border-gov-head/30 bg-white px-1 py-px text-[12px] font-semibold text-gov-head">
                        지금 기준
                      </span>
                    )}
                    {overLimit && (
                      <span className="mt-0.5 block text-[12px] font-normal text-gov-point">
                        이 금액은 한도를 넘어요
                      </span>
                    )}
                  </th>
                  <td className="px-4 py-3 text-gov-ink2">{won(product.limit)}</td>
                  <td className="px-4 py-3 text-gov-ink2">
                    {product.grace_years}년 거치 · {product.amort_years}년 상환
                  </td>
                  <td className="px-4 py-3 text-gov-ink2">
                    {failed ? "계산 실패" : s ? won(s.amort_payment) : "—"}
                  </td>
                  <td className="px-4 py-3 text-gov-ink2">
                    {failed ? "계산 실패" : s ? pct(s.crisis_prob) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Fold tone="gov" summary="제도 조건의 근거" hint="원문 인용 보기">
        <ul className="space-y-3">
          {rows.map(({ product }) => (
            <li key={product.id}>
              <p className="text-[13px] font-semibold text-gov-ink">{product.name}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-gov-ink2">{product.source}</p>
              {product.note && (
                <p className="mt-1 text-[12px] leading-relaxed text-gov-ink3">{product.note}</p>
              )}
            </li>
          ))}
        </ul>
      </Fold>

      <p className="text-[12px] leading-relaxed text-gov-ink3">
        신청 자격은 자금마다 달라요.{" "}
        <Link href="#자격" className="lnk inline-flex min-h-11 items-center">
          아래 「신청 자격 스스로 대보기」
        </Link>
        에서 조항과 함께 확인할 수 있어요.
      </p>
    </div>
  );
}
