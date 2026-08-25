import LandingCliff from "@/components/LandingCliff";

const STATS = [
  { label: "청년농 평균 부채", value: "2억 3,900만원" },
  { label: "상환이 어렵다고 답한 비율", value: "55.3%" },
  { label: "회생자금을 이용한 비율", value: "2.6%" },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
      <p className="text-sm font-medium tracking-wide text-signal-warn">
        정책자금 신청 전 상환여력 점검
      </p>
      <h1 className="mt-4 text-3xl font-bold leading-snug tracking-tight sm:text-5xl sm:leading-tight">
        5억을 빌릴 수 있다는 말은,
        <br />
        <span className="text-signal-danger">5억을 갚을 수 있다는 뜻이 아닙니다</span>
      </h1>
      <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-400">
        후계농 육성자금은 5년 거치 20년 상환입니다. 처음 5년은 이자만 냅니다. 문제는
        6년차입니다. 원금이 붙는 순간 연 상환액이 몇 배로 뛰고, 그때 소득이 따라오지
        못하면 돌려막기가 시작됩니다.
      </p>

      <section className="mt-12 rounded-2xl border border-ink-700 bg-ink-900 p-5 sm:p-7">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-200">
            상환 절벽 — 딸기(시설,수경) 1,000평 · 한도 5억 차입
          </h2>
          <span className="text-xs text-slate-500">
            농촌진흥청 2023년 소득조사 기준 · 생활비 연 2,400만원 가정
          </span>
        </div>
        <LandingCliff />
        <p className="mt-4 text-sm text-slate-400">
          거치기간 연 이자 <span className="tabular text-slate-200">750만원</span> →
          상환기 연 원리금{" "}
          <span className="tabular text-signal-danger">2,912만원</span> (3.9배). 점선은
          이 농가가 실제로 상환에 쓸 수 있는 금액입니다.
        </p>
      </section>

      <section className="mt-12 grid gap-4 sm:grid-cols-3">
        {STATS.map((s) => (
          <div key={s.label} className="rounded-xl border border-ink-800 bg-ink-900 p-5">
            <div className="tabular text-2xl font-semibold text-slate-100">{s.value}</div>
            <div className="mt-1 text-xs leading-relaxed text-slate-500">{s.label}</div>
          </div>
        ))}
      </section>
      <p className="mt-3 text-xs text-slate-600">
        출처: KREI 『농업경영체의 부채 실태와 정책 과제』 R2025-09
      </p>

      <div className="mt-12">
        <a
          href="/diagnose"
          className="inline-flex items-center rounded-lg bg-slate-100 px-6 py-3.5 text-base font-semibold text-ink-950 transition hover:bg-white"
        >
          내 상환 여력 확인하기
        </a>
        <p className="mt-3 text-xs text-slate-500">
          계정 없이 바로 계산합니다. 입력값은 저장되지 않고 결과는 링크로만 공유됩니다.
        </p>
      </div>

      <section className="mt-16 grid gap-6 border-t border-ink-800 pt-10 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">하는 것</h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-400">
            <li>· 적정 차입 한도 산출 (DSCR 기준 역산)</li>
            <li>· 상환 리스크 시뮬레이션 (소득 변동·재해 반영)</li>
            <li>· 제도 요건에 대한 조항 인용 응답</li>
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-200">하지 않는 것</h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-500">
            <li>· 부도 예측 · 신용평가</li>
            <li>· 대출 알선 · 상품 추천</li>
            <li>· 투자 조언</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
