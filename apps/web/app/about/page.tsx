import Link from "next/link";
import { Badge, Crumb, Notice, Page, PageTitle, Panel, Section } from "@/components/gov";

export const metadata = { title: "서비스 소개 | Seed Money" };

const PROBLEMS = [
  {
    n: "01",
    t: "상환 구조와 소득 구조가 어긋나 있습니다",
    b: "여신 제도는 매달 나눠 갚는 것을 전제로 설계돼 있습니다. 그런데 농업 소득은 연 1~2회 수확기에 몰려 들어옵니다. 흑자를 내는 농가도 특정 시점에는 현금이 마릅니다.",
  },
  {
    n: "02",
    t: "정책자금의 좋은 조건이 과잉 차입을 부릅니다",
    b: "연 1.5% 고정금리에 5년 거치는 초기 정착에 꼭 필요한 조건입니다. 다만 부담이 당장 느껴지지 않아 한도까지 빌리게 되고, 거치가 끝나는 6년차에 원금 상환이 한 번에 시작됩니다.",
  },
  {
    n: "03",
    t: "‘얼마까지 빌려야 안전한가’를 알려 주는 곳이 없습니다",
    b: "기존 서비스와 심사 시스템은 모두 최대 얼마를 받을 수 있는지에 집중합니다. 미래 현금흐름을 근거로 스스로 상한을 정하도록 돕는 도구는 없습니다.",
  },
];

const FEATURES = [
  {
    n: "①",
    t: "미래 현금흐름 예측",
    href: "/app/revenue",
    b: "작목·면적·과거 가격·경영비를 종합해 예상 매출과 순현금흐름을 산출합니다. 총수입은 출하월에, 경영비와 생활비는 매달 나가는 것으로 펼쳐 현금이 마르는 달을 찾습니다.",
  },
  {
    n: "②",
    t: "적정 여신 설계",
    href: "/app/finance",
    b: "신청 가능한 최대 한도를 보여 주는 데서 그치지 않고, 거치가 끝난 뒤에도 감당할 수 있는 차입 원금을 역산합니다. 금액 계산과 상환 스케줄은 전부 결정론적 코드가 수행하며, 언어모델은 그 결과를 설명하는 데만 씁니다.",
  },
  {
    n: "③",
    t: "스트레스 테스트",
    href: "/app/safety",
    b: "가격 20% 하락, 생산량 30% 감소, 금리 25bp 상승, 재해 빈발 시나리오에서 상환이 가능한지 다시 계산하고, 취약해지는 연차를 미리 알려 줍니다.",
  },
];

export default function AboutPage() {
  return (
    <Page>
      <Crumb trail={[{ label: "서비스 안내" }, { label: "서비스 소개" }]} />
      <PageTitle
        title="서비스 소개"
        lead="농가의 경영 데이터를 금융 데이터로 바꿉니다. 농가에는 감당 가능한 대출을, 금융기관에는 농업 특성을 반영한 여신 설계를 제공합니다."
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
              금융기관에는 <b className="text-gov-ink">“3억원 대출 시 가격 하위 시나리오에서 상환여력
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
              ["내 농가 정보 입력", "작목과 면적, 생활비 세 가지면 시작합니다. 소득 이력을 넣으면 변동성을 개인화합니다.", "/app/farm"],
              ["수익 전망 확인", "월별 현금흐름에서 운전자금이 부족해지는 달을 봅니다.", "/app/revenue"],
              ["안전진단과 적정 차입", "나쁜 시나리오에서 버티는지 확인하고 권장 차입 규모를 받습니다.", "/app/safety"],
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
