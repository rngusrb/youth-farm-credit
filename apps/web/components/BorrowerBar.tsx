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
    // **드롭다운으로 고른다.** 처음엔 카드 5장을 펼쳤는데, 차주가 늘면 화면을 다 먹는다 —
    // 목록은 5명이지만 실제 서비스에서는 신청 DB 다. 고른 뒤의 표시줄과 같은 모양이라
    // 화면이 바뀌어도 눈이 같은 자리를 본다. (2026-09-07 유저 지적)
    return (
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-gov-line bg-gov-sunk px-4 py-3">
        <div className="min-w-0">
          <p className="text-[12px] text-gov-ink3">심사 중인 차주</p>
          <p className="text-[14px] font-bold text-gov-head">고르지 않음</p>
        </div>
        <label className="ml-auto flex items-center gap-2 text-[13px] text-gov-ink2">
          차주 고르기
          <select
            defaultValue=""
            onChange={(e) => {
              if (!e.target.value) return;
              clearAnalysisCache();
              selectBorrower(e.target.value);
            }}
            className="min-h-11 rounded-md border border-gov-line bg-white px-2.5 text-[13px]"
          >
            <option value="">선택하세요</option>
            {APPLICANTS.map((a) => (
              <option key={a.ref} value={a.ref}>
                {a.ref} · {a.name} · {a.pyeong.toLocaleString()}평
              </option>
            ))}
          </select>
        </label>
        <p className="w-full text-[12px] text-gov-ink3">
          고른 차주의 신청 조건으로 계산합니다. 다른 심사 화면으로 옮겨도 유지돼요. 판정을
          한눈에 보려면{" "}
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
