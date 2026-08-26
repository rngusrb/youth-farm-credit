type Source = "MEASURED" | "PARTIAL" | "ASSUMED" | "PERSONAL" | "OVERRIDE";

/**
 * σ 의 출처를 있는 그대로 표시한다.
 *
 * 전에는 σ 가 조금이라도 실측이면 MEASURED 로 붙였는데, 실제로 실측한 것은
 * 시장 공통분뿐이고 농가 고유분은 가정값이다. 딸기는 분산의 63% 가 가정이다.
 * 과대 주장이라 등급을 나눴다 — 본문에서 정직하게 밝히고 라벨에서 손해 보는 것보다,
 * 라벨에 그대로 적는 편이 신뢰를 얻는다.
 */
export default function AssumedBadge({
  source = "ASSUMED",
  assumedShare,
  className = "",
}: {
  source?: Source;
  assumedShare?: number | null;
  className?: string;
}) {
  const pct =
    typeof assumedShare === "number" ? `${Math.round(assumedShare * 100)}%` : null;

  const spec: Record<Source, { label: string; tone: string; title: string }> = {
    PERSONAL: {
      label: "내 이력 기반",
      tone: "border-paper-ok/40 bg-paper-okbg text-paper-ok",
      title: "입력하신 농가 소득 이력으로 계산했습니다. 가정이 섞이지 않습니다.",
    },
    MEASURED: {
      label: "실측값",
      tone: "border-paper-ok/40 bg-paper-okbg text-paper-ok",
      title: "공표 통계 시계열로 실측한 변동성입니다.",
    },
    PARTIAL: {
      label: "부분 실측",
      tone: "border-paper-accent/40 bg-paper-accentbg text-paper-accent",
      title:
        `시장 공통 변동은 농촌진흥청 소득조사로 실측했고, 농가별 고유 변동은 가정값입니다.` +
        (pct ? ` 분산 기준 ${pct}가 가정입니다.` : "") +
        " 소득 이력을 입력하면 가정이 사라집니다.",
    },
    ASSUMED: {
      label: "가정값",
      tone: "border-paper-danger/40 bg-paper-dangerbg text-paper-danger",
      title: "실측되지 않은 가정값입니다. 소득 이력을 입력하면 개인화됩니다.",
    },
    OVERRIDE: {
      label: "지정값",
      tone: "border-paper-rule bg-paper-sunk text-paper-ink3",
      title: "검증용으로 직접 지정한 값입니다.",
    },
  };
  const s = spec[source] ?? spec.ASSUMED;

  return (
    <span
      title={s.title}
      className={`ml-2 inline-flex cursor-help items-center rounded border px-1.5 py-0.5 align-middle text-[12px] font-medium ${s.tone} ${className}`}
    >
      {s.label}
    </span>
  );
}
