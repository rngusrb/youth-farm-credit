"use client";

import Link from "next/link";

import { APPLICANTS } from "@/lib/applicants";
import { selectBorrower } from "@/lib/borrower";
import { clearAnalysisCache } from "@/lib/analysisCache";
import { useBorrower } from "@/lib/useBorrower";
import { won } from "@/lib/format";

/** 지금 심사 중인 차주를 항상 보여주고, 여기서 바꾼다.
 *
 * 사고 이력 2026-09-07: 심사 화면 셋이 차주를 몰라서 "이 화면이 누구 걸 보여주는
 * 건지" 를 알 수 없었다. 화면마다 이 줄을 맨 위에 둬서 그 물음이 안 생기게 한다.
 */
export default function BorrowerBar() {
  const { borrower, ready } = useBorrower();
  if (!ready) return null;

  if (!borrower) {
    // **여기서 바로 고를 수 있게 한다.** 목록으로 보내면 화면을 두 번 옮겨야 하고,
    // 심사역은 이미 이 화면에 볼 게 있어서 온 것이다. (2026-09-07 유저 지적)
    return (
      <div className="mb-4 rounded-md border border-gov-line bg-gov-sunk px-4 py-4">
        <p className="text-[14px] font-semibold text-gov-head">심사할 차주를 고르세요</p>
        <p className="mt-1 text-[13px] text-gov-ink2">
          고른 차주의 신청 조건으로 계산합니다. 다른 심사 화면으로 옮겨도 그대로 유지돼요.
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {APPLICANTS.map((a) => (
            <li key={a.ref}>
              <button
                type="button"
                onClick={() => { clearAnalysisCache(); selectBorrower(a.ref); }}
                className="flex min-h-11 w-full flex-col justify-center rounded-md border border-gov-line bg-white px-3 py-2 text-left transition hover:border-gov-head hover:bg-gov-soft"
              >
                <span className="text-[13px] font-bold text-gov-ink">
                  {a.ref} · {a.name}
                </span>
                <span className="text-[12px] text-gov-ink2">
                  {a.region} · {a.pyeong.toLocaleString()}평 · 신청 {won(a.requested)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] text-gov-ink3">
          판정까지 한눈에 보려면{" "}
          <Link href="/bank/applicants" className="font-semibold text-gov-head underline">
            대출 신청자 목록
          </Link>
          으로 가세요.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-gov-line bg-gov-sunk px-4 py-3">
      <div className="min-w-0">
        <p className="text-[12px] text-gov-ink3">심사 중인 차주</p>
        <p className="text-[14px] font-bold text-gov-head">
          {borrower.ref} · {borrower.name}
          <span className="ml-2 font-normal text-gov-ink2">
            {borrower.region} · {borrower.pyeong.toLocaleString()}평 · 신청 {won(borrower.requested)}
          </span>
        </p>
      </div>
      <label className="ml-auto flex items-center gap-2 text-[13px] text-gov-ink2">
        차주 바꾸기
        <select
          value={borrower.ref}
          onChange={(e) => {
            // 차주가 바뀌면 이전 계산은 남겨 두지 않는다 — 바뀐 조건에 옛 결과를
            // 보여주는 것이 이 화면에서 제일 나쁜 실패다.
            clearAnalysisCache();
            selectBorrower(e.target.value);
          }}
          className="min-h-11 rounded-md border border-gov-line bg-white px-2.5 text-[13px]"
        >
          {APPLICANTS.map((a) => (
            <option key={a.ref} value={a.ref}>
              {a.ref} · {a.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
