/**
 * 값의 출처를 세 갈래로 구분한다 (UX-010).
 *
 * 왜 있나: 심사역에게 "이 숫자가 어디서 왔나"는 곧 심사 근거다. 차주가 말한 값과
 * 통계에서 가져온 값과 우리가 가정한 값이 한 표에 섞여 있으면, 셋 다 같은 무게로
 * 읽힌다. 가정값을 통계처럼 읽는 순간 심사가 틀어진다.
 *
 * 배지는 **라벨 쪽**에 붙인다 — 심사 화면은 표가 주고, 숫자를 가리면 안 된다.
 */
export type SourceKind = "input" | "public" | "assumed";

const SPEC: Record<SourceKind, { label: string; tone: string; title: string }> = {
  input: {
    label: "입력",
    tone: "border-gov-line bg-gov-sunk text-gov-ink2",
    title: "차주가 신청서에 적어 낸 값입니다. 검증 대상입니다.",
  },
  public: {
    label: "통계",
    tone: "border-gov-ok2/35 bg-gov-okbg text-gov-ok2",
    title: "공표 통계에서 가져온 값입니다. 원 자료는 자료실과 작목 데이터에 있습니다.",
  },
  assumed: {
    label: "가정",
    tone: "border-gov-warn2/40 bg-gov-warnbg text-gov-warn2",
    title: "실측 근거가 없어 가정한 값입니다. 근거는 옆에 적었습니다.",
  },
};

export default function SourceTag({
  kind,
  note,
  className = "",
}: {
  kind: SourceKind;
  /** 가정값이면 그 근거(또는 근거 없음)를 함께 적는다. */
  note?: string;
  className?: string;
}) {
  const s = SPEC[kind];
  return (
    <span
      title={note ? `${s.title} ${note}` : s.title}
      className={`ml-1.5 inline-flex cursor-help items-center rounded-sm border px-1 py-px align-middle text-[12px] font-medium leading-tight ${s.tone} ${className}`}
    >
      {s.label}
    </span>
  );
}

/** 표 위에 한 번 두는 범례. 배지만 있으면 무슨 뜻인지 알 길이 없다. */
export function SourceLegend({ className = "" }: { className?: string }) {
  return (
    <p className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-gov-ink3 ${className}`}>
      <span className="font-semibold text-gov-ink2">값의 출처</span>
      {(["input", "public", "assumed"] as SourceKind[]).map((k) => (
        <span key={k} className="inline-flex items-center">
          <SourceTag kind={k} className="ml-0" />
          <span className="ml-1.5">{LEGEND[k]}</span>
        </span>
      ))}
    </p>
  );
}

const LEGEND: Record<SourceKind, string> = {
  input: "차주 입력",
  public: "공개 통계",
  assumed: "가정",
};
