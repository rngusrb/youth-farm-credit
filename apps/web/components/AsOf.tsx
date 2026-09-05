import type { AsOf } from "@/lib/api";

/**
 * 값이 **언제 것인지** 한 줄로 밝힌다.
 *
 * 왜 있나: 리포트 표지에 발행일(오늘)만 찍혀 있으면 읽는 사람은 숫자도
 * 오늘 것이라 읽는다. 실제로는 소득조사 2023~2024년, 경영비 2022~2024년,
 * σ 계열 2013~2024년으로 서로 다르다. 그 차이를 감추지 않는다.
 *
 * 규칙: 없는 시점은 **쓰지 않는다**. 화면에서 `new Date()` 로 채우지 않는다.
 */
export default function AsOfLine({
  as_of,
  className = "",
}: {
  as_of?: AsOf;
  className?: string;
}) {
  const parts = asOfParts(as_of);
  if (!parts.length) return null;
  return (
    <p className={`text-[12px] leading-relaxed text-paper-ink3 ${className}`}>
      <span className="font-semibold">기준 시점</span> · {parts.join(" · ")}
    </p>
  );
}

/** 화면마다 붙이는 모양이 달라서 문자열 목록만 따로 뽑아 쓴다. */
export function asOfParts(as_of?: AsOf): string[] {
  if (!as_of) return [];
  const out: string[] = [];
  if (as_of.income_survey_year) out.push(`소득조사 ${as_of.income_survey_year}년`);
  if (as_of.cost_survey_year) out.push(`농사 비용 ${as_of.cost_survey_year}년`);
  if (as_of.sigma_series) out.push(`변동성 ${as_of.sigma_series}년 계열`);
  if (as_of.market_window) out.push(`도매가 ${as_of.market_window[0]}~${as_of.market_window[1]}`);
  // 자료실 원문(2026년판)과 대출조건을 대조한 문서(2025년판)는 다르다.
  // "지침 확인" 한 마디로 묶으면 둘이 같은 것처럼 읽힌다.
  if (as_of.guideline_checked_on) {
    const y = as_of.guideline_year ? `${as_of.guideline_year}년 지침` : "지침";
    out.push(`대출조건 ${y} 대조 ${as_of.guideline_checked_on}`);
  }
  return out;
}
