import Link from "next/link";

import type { Diagnosis } from "@/lib/api";
import { won } from "@/lib/format";

/** 이 진단의 "내 소득"이 어디서 왔는지 밝힌다.
 *
 * 사고 이력 2026-09-02: 진단은 작목 통계 추정치를 "내 연간 농업소득"이라 부르고,
 * 같은 서비스의 평균 비교는 실적을 "내 소득"이라 불렀다. 농가는 한 화면에서
 * **서로 다른 두 개의 "내 소득"**을 봤다. 엔진을 고쳐 실적이 3개년 이상이면 실적을
 * 쓰게 했고, 화면은 어느 쪽을 썼는지 항상 밝힌다.
 *
 * **화면은 계산하지 않는다** — 값도 문구도 엔진이 준 것을 그대로 쓴다.
 */
export default function IncomeSource({ d }: { d: Diagnosis }) {
  const actual = d.income.source === "ACTUAL";
  return (
    <div className="rounded-lg border border-gov-line bg-gov-sunk px-3 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span
          className={`rounded px-1.5 py-1 text-[12px] font-semibold ${
            actual ? "bg-gov-head text-white" : "bg-gov-line text-gov-ink2"
          }`}
        >
          {actual ? `실적 ${d.income.history_years}개년` : "작물 통계로 계산"}
        </span>
        <b className="text-[15px] tabular text-gov-ink">{won(d.income.annual)}</b>
        <span className="text-[12px] text-gov-ink3">
          {actual
            ? `· 같은 작목·면적의 전국 평균은 ${won(d.income.crop_average)}`
            : "· 아직 내 실적이 반영되지 않았어요"}
        </span>
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-gov-ink2">
        {d.income.source_note}{" "}
        {!actual && (
          <Link href="/app/farm" className="text-gov-link underline">
            내 농가 정보
          </Link>
        )}
        {!actual && "에서 연도별 농사로 번 돈을 넣을 수 있어요."}
      </p>
    </div>
  );
}
