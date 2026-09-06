import Link from "next/link";
import { Badge, Crumb, Notice, Page, PageTitle, Panel, Section } from "@/components/gov";

export const metadata = { title: "서비스 소개 | Seed Money" };

const PROBLEMS = [
  {
    n: "01",
    t: "돈이 들어오는 날과 갚는 날이 달라요",
    b: "농사로 번 돈은 수확기에 몰려 들어와요. 농사 비용과 생활비는 그 전에도 필요해요. 한 해 수입이 충분해도 특정 달에는 돈이 부족할 수 있어요.",
  },
  {
    n: "02",
    t: "처음보다 나중에 갚을 돈이 많아져요",
    b: "처음 5년 동안 이자만 내는 대출도 있어요. 6년차부터는 빌린 돈도 함께 갚아야 해요. 처음의 이자만 보고 빌릴 금액을 정하면 나중에 부담이 커질 수 있어요.",
  },
  {
    n: "03",
    t: "빌릴 수 있는 금액과 갚을 준비는 달라요",
    b: "지원 사업에서 정한 최대 금액이 내 농장에도 맞는 것은 아니에요. 앞으로 갚을 돈과 생활비를 함께 따져봐야 해요.",
  },
];

const FEATURES = [
  {
    n: "①",
    t: "미래 돈의 흐름 예측",
    href: "/app/revenue",
    b: "키우는 작물과 면적으로 들어올 돈과 농사 비용을 계산해요. 달마다 쓰고 남는 돈을 살펴봐요.",
  },
  {
    n: "②",
    t: "대출 금액 계획",
    href: "/app/finance",
    b: "빌리는 금액을 바꿔가며 갚을 돈을 비교해요. AI는 정해진 계산 방식으로 나온 결과를 쉽게 설명해요.",
  },
  {
    n: "③",
    t: "어려운 상황 미리 계산하기",
    href: "/app/safety",
    b: "가격이 20% 떨어지거나 수확량이 30% 줄어들면 어떻게 될까요? 금리 상승과 재해 상황도 넣어 대출 갚기가 어려운 해를 살펴봐요.",
  },
];

export default function AboutPage() {
  return (
    <Page>
      <Crumb trail={[{ label: "서비스 안내" }, { label: "서비스 소개" }]} />
      <PageTitle
        title="서비스 소개"
        lead="내 농장에 들어오고 나가는 돈을 살펴봐요. 대출을 갚을 때 돈이 부족할 수 있는 시점도 미리 확인해요."
      />

      <div id="main">
        <Section title="왜 만들었나">
          <div className="grid gap-px bg-gov-line lg:grid-cols-3">
            {PROBLEMS.map((p) => (
              <div key={p.n} className="bg-white p-5">
                <span className="tabular text-[13px] font-extrabold text-gov-point">{p.n}</span>
                <h3 className="mt-1.5 text-[15px] font-bold leading-snug text-gov-ink">{p.t}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-gov-ink2">{p.b}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="핵심 차별점">
          <Panel>
            <p className="text-[16px] font-bold leading-relaxed text-gov-ink">
              “대출을 얼마까지 받을 수 있는가”가 아니라{" "}
              <span className="text-gov-head">“얼마까지 받아야 안전한가”</span>를 알려 줍니다.
            </p>
            <div className="mt-5 grid gap-px bg-gov-line sm:grid-cols-3">
              {[
                ["제도상 신청 가능", "5억원", "시행지침이 정한 세대당 한도", "plain"],
                ["은행 심사 관행", "3.5억원", "DSCR 1.25 기준 — 소득이 안 흔들린다는 가정", "warn"],
                ["감당 가능", "2.3억원", "가격 변동과 재해까지 넣고 25년을 시뮬레이션", "ok"],
              ].map(([k, v, d, tone]) => (
                <div key={k} className="bg-white p-4">
                  <div className="text-[12px] font-medium text-gov-ink3">{k}</div>
                  <div
                    className={`tabular mt-1 text-[24px] font-extrabold ${
                      tone === "ok" ? "text-gov-ok" : tone === "warn" ? "text-gov-warn" : "text-gov-ink"
                    }`}
                  >
                    {v}
                  </div>
                  <div className="mt-1.5 text-[12px] leading-snug text-gov-ink3">{d}</div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[13px] leading-relaxed text-gov-ink2">
              같은 분석을 농가에는 <b className="text-gov-ink">“2.3억원 이하 차입을 권장합니다”</b>로,
              금융기관에는 <b className="text-gov-ink">“3억원 대출 시 가격 하위 시나리오에서 갚는 데 쓸 돈
              부족”</b>으로 냅니다. 위 금액은 설명을 위한 예시이며 실제 값은 농가마다 다릅니다.
            </p>
          </Panel>
        </Section>

        <Section title="세 가지 핵심 기능">
          <div className="space-y-px bg-gov-line">
            {FEATURES.map((f) => (
              <div key={f.n} className="flex flex-col gap-3 bg-white p-5 sm:flex-row sm:gap-6">
                <div className="shrink-0 text-[22px] font-extrabold text-gov-link">{f.n}</div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[16px] font-bold text-gov-ink">{f.t}</h3>
                  <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-gov-ink2">{f.b}</p>
                </div>
                <Link href={f.href} className="shrink-0 self-start inline-flex min-h-11 items-center rounded-md border border-gov-line px-3 text-[12px] font-semibold text-gov-ink2 hover:border-gov-link hover:text-gov-head">
                  바로가기 →
                </Link>
              </div>
            ))}
          </div>
        </Section>

        <Section title="숫자를 만드는 규칙">
          <div className="grid gap-px bg-gov-line sm:grid-cols-2">
            {[
              ["언어모델은 숫자를 만들지 않습니다", "금액·확률·상환 스케줄은 전부 결정론적 코드가 계산합니다. 언어모델은 계산된 값을 문장으로 옮기는 데만 씁니다. 계산 엔진은 외부 접속 없이 전부 테스트됩니다."],
              ["근거 없으면 답하지 않습니다", "제도 요건은 시행지침 원문 조항을 찾아 함께 냅니다. 조항을 못 찾으면 답변을 만들지 않습니다."],
              ["가정은 가정이라고 표시합니다", "실측한 값과 가정한 값을 화면에서 구분합니다. 예를 들어 농가별 고유 변동성은 전국 평균에서 보이지 않아 가정값을 쓰며, 소득 이력을 입력하면 실측으로 바뀝니다."],
              ["모르는 값을 지어내지 않습니다", "농신보 보증료율은 지침에 명시돼 있지 않아 계산에 넣지 않았습니다. 그만큼 이 계산은 실제보다 낙관적입니다 — 이 사실도 함께 적습니다."],
            ].map(([t, b]) => (
              <div key={t} className="bg-white p-5">
                <h3 className="text-[14px] font-bold text-gov-ink">{t}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-gov-ink2">{b}</p>
              </div>
            ))}
          </div>
        </Section>

        <section id="how" className="scroll-mt-24">
          <h2 className="sec-title mb-3">이용 방법</h2>
          <ol className="border-t border-gov-ink/70">
            {[
              ["로그인", "데모 계정으로 농가용·금융기관용 화면을 모두 볼 수 있습니다.", "/login"],
              ["내 농장정보 입력", "작목과 면적, 생활비 세 가지면 시작합니다. 소득 이력을 넣으면 변동성을 개인화합니다.", "/app/farm"],
              ["농사 수입과 지출 확인", "월별 들어오고 나가는 돈에서 운전자금이 부족해지는 달을 봅니다.", "/app/revenue"],
              ["안전진단과 적정 차입", "나쁜 시나리오에서 버티는지 확인하고 권장 대출금을 받습니다.", "/app/safety"],
            ].map(([t, d, href], i) => (
              <li key={t} className="flex gap-4 border-b border-gov-line2 px-1 py-3.5">
                <span className="tabular w-6 shrink-0 font-extrabold text-gov-link">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <Link href={href} className="text-[14px] font-semibold text-gov-ink hover:text-gov-link">{t}</Link>
                  <p className="mt-0.5 text-[12px] text-gov-ink2">{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <div className="mt-8">
          <Notice tone="warn" title="이 서비스가 하지 않는 일">
            부도 예측, 신용평가, 대출 알선, 금융상품 추천을 하지 않습니다. 계산 결과는 참고
            자료이며 대출 심사 결과가 아닙니다. 실제 대출 가능 여부와 조건은 사업 시행기관과
            취급 금융기관의 심사로 결정됩니다.
          </Notice>
        </div>
      </div>
    </Page>
  );
}
