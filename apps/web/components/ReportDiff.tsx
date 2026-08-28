"use client";

import type { SavedReport } from "@/lib/profile";
import { pct, pyeong as fmtPyeong, won } from "@/lib/format";

/**
 * 지난 분석과 무엇이 달라졌나 (UX-015).
 *
 * **차이를 숫자로 만들지 않는다.** 두 값을 나란히 놓고 방향만 표시한다.
 * 화면에서 뺄셈을 시작하면 그 값의 출처가 어디인지 아무도 모르게 된다
 * (전역 금지사항 — 화면에서 숫자를 계산하지 않는다).
 *
 * 방향에 좋다/나쁘다를 붙이지 않는다 (화법 규칙 2). 권장 금액이 늘어난 것이
 * 좋은 일인지는 상황에 따라 다르다 — 화살표와 숫자만 놓는다.
 */
export default function ReportDiff({ rows }: { rows: SavedReport[] }) {
  // 기록이 하나뿐이면 비교가 없다. 없는 비교를 만들지 않는다.
  if (rows.length < 2) return null;

  const [now, before] = rows;
  const changed = inputChanges(before, now);

  return (
    <section className="mb-8 rounded-xl border border-gov-line bg-white p-5">
      <h2 className="text-[15px] font-bold text-gov-ink">지난 분석과 달라진 것</h2>
      <p className="mt-1 text-[12px] text-gov-ink3">
        {stamp(before.savedAt)} 기록과 견줬어요.
      </p>

      {changed.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-gov-ink2">
          {changed.map((c) => (
            <li key={c.label} className="min-w-0 break-keep">
              <span className="text-gov-ink3">{c.label}</span>{" "}
              <span>{c.before}</span>
              <Arrow dir="same" />
              <b className="text-gov-ink">{c.after}</b>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-gov-ink2">입력한 조건은 그대로예요.</p>
      )}

      <dl className="mt-4 grid gap-4 border-t border-gov-line2 pt-4 sm:grid-cols-2">
        <Pair label="권장 차입" before={won(before.riskLimit)} after={won(now.riskLimit)}
              dir={dir(before.riskLimit, now.riskLimit)} />
        <Pair label="2년 연속 위기 확률" before={pct(before.crisisProb)} after={pct(now.crisisProb)}
              dir={dir(before.crisisProb, now.crisisProb)} />
      </dl>
    </section>
  );
}

/** 방향만 낸다 — 차이를 숫자로 만들지 않는다. */
export function dir(before: number, after: number): "up" | "down" | "same" {
  if (after > before) return "up";
  if (after < before) return "down";
  return "same";
}

/** 무엇을 바꿔서 결과가 달라졌는지. 값이 같으면 목록에 넣지 않는다. */
export function inputChanges(
  before: SavedReport,
  after: SavedReport,
): { label: string; before: string; after: string }[] {
  const out: { label: string; before: string; after: string }[] = [];
  if (before.cropName !== after.cropName)
    out.push({ label: "작목", before: before.cropName, after: after.cropName });
  if (before.pyeong !== after.pyeong)
    out.push({ label: "면적", before: fmtPyeong(before.pyeong), after: fmtPyeong(after.pyeong) });
  if (before.productName !== after.productName)
    out.push({ label: "정책자금", before: before.productName, after: after.productName });
  return out;
}

/** 저장 시점만 쓴다 — `new Date()` 로 오늘을 찍지 않는다 (UX-009). */
function stamp(ms: number): string {
  return new Date(ms).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

function Arrow({ dir }: { dir: "up" | "down" | "same" }) {
  const sign = { up: "↑", down: "↓", same: "→" }[dir];
  const label = { up: "늘었어요", down: "줄었어요", same: "바뀌었어요" }[dir];
  return (
    <span className="mx-1.5 text-gov-ink3">
      <span aria-hidden>{sign}</span>
      <span className="sr-only"> {label} </span>
    </span>
  );
}

function Pair({
  label, before, after, dir: d,
}: {
  label: string; before: string; after: string; dir: "up" | "down" | "same";
}) {
  return (
    <div>
      <dt className="text-[12px] text-gov-ink3">{label}</dt>
      <dd className="tabular mt-1 text-[15px] text-gov-ink2">
        {before}
        <Arrow dir={d} />
        <b className="text-[17px] font-bold text-gov-ink">{after}</b>
      </dd>
    </div>
  );
}
