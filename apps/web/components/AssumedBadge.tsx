/** σ 의 출처를 있는 그대로 표시한다 (§3.1, §7.3). */
export default function AssumedBadge({
  source = "ASSUMED",
  personalized = false,
  className = "",
}: {
  source?: "ASSUMED" | "MEASURED";
  personalized?: boolean;
  className?: string;
}) {
  if (source === "MEASURED" && personalized) {
    return (
      <span
        title="이 농가의 실제 소득 이력으로 계산한 변동성입니다."
        className={`ml-2 inline-flex items-center rounded border border-signal-ok/40 bg-signal-ok/10 px-1.5 py-0.5 align-middle text-[10px] font-medium text-signal-ok ${className}`}
      >
        내 이력 기반
      </span>
    );
  }
  if (source === "MEASURED") {
    return (
      <span
        title="공표 통계 시계열로 실측한 변동성입니다."
        className={`ml-2 inline-flex items-center rounded border border-signal-ok/40 bg-signal-ok/10 px-1.5 py-0.5 align-middle text-[10px] font-medium text-signal-ok ${className}`}
      >
        실측값
      </span>
    );
  }
  return (
    <span
      title="소득 변동성(σ)은 실측값이 아닌 가정값입니다. 소득 이력을 입력하면 개인화됩니다."
      className={`ml-2 inline-flex items-center rounded border border-signal-warn/40 bg-signal-warn/10 px-1.5 py-0.5 align-middle text-[10px] font-medium text-signal-warn ${className}`}
    >
      변동성 가정값
    </span>
  );
}
