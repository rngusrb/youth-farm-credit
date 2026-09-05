"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Btn, Panel, Section, Stat } from "@/components/gov";
import { NOTICES } from "@/lib/content";
import { fetchCrops } from "@/lib/api";
import { DEMO_HINT, ROLE_HOME, ROLE_LABEL } from "@/lib/auth";
import { useSession } from "@/lib/useSession";
import AuctionSummary from "@/components/AuctionSummary";

const STEPS = [
  ["01", "내 농장정보 입력", "농장 현황과 올해 농사·자금 계획을 알려 주세요."],
  ["02", "AI 농가 건강검진", "내 소득과 같은 작물의 전국 평균을 비교해요."],
  ["03", "AI 농사 자금지도", "월별 돈의 흐름과 앞으로 부족할 시점을 살펴봐요."],
  ["04", "AI 농가 상담사", "진단 결과를 묻고 조건을 바꿔 계산해 보세요."],
  ["05", "AI 맞춤 처방", "개선 방법을 찾고 신청서 초안을 준비해요."],
];

export default function PortalHome() {
  const { session, ready } = useSession();
  const [cropCount, setCropCount] = useState<number | null>(null);
  useEffect(() => {
    fetchCrops().then((d) => setCropCount(d.crops.length)).catch(() => setCropCount(null));
  }, []);

  return (
    <main id="main">
      {/* ── 히어로 ─────────────────────────────────────── */}
      <div className="border-b border-gov-line bg-gradient-to-b from-gov-soft to-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 lg:grid-cols-[1fr_360px]">
          <div>
            <Badge tone="info">2026 금융 AI 챌린지 출품작</Badge>
            <h1 className="mt-4 text-[34px] font-extrabold leading-[1.25] tracking-tight text-gov-ink">
              얼마까지 받을 수 있는가가 아니라,
              <br />
              <span className="text-gov-head">얼마까지 받아야 안전한가.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-gov-ink2">
              농사로 번 돈은 수확기에 들어오지만, 쓸 돈은 매달 필요해요.
              <b className="text-gov-ink">돈이 부족할 수 있는 시점</b>을 미리 살펴보세요.
              빌릴 금액을 바꿔가며 내 농장에 맞는 대출 계획도 세울 수 있어요.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Btn href={ready && session ? ROLE_HOME[session.role] : "/app"}>
                {ready && session
                  ? session.role === "bank" ? "심사 대시보드" : "내 농가 화면"
                  : "진단 시작하기"}
              </Btn>
              <Btn href="/about" variant="ghost">서비스 소개</Btn>
              <Btn href="/policy" variant="ghost">지원 제도 찾아보기</Btn>
            </div>
          </div>

          <Panel className="self-start">
            {ready && session ? (
              <>
                <h2 className="sec-title mb-3">{session.name}님</h2>
                <p className="text-[13px] leading-relaxed text-gov-ink2">
                  {ROLE_LABEL[session.role]} 계정으로 로그인되어 있어요.
                  {session.role === "bank"
                    ? " 업무 화면에서 접수된 신청 건의 상환능력과 적정 여신을 봅니다."
                    : " 업무 화면에서 내 농가의 돈의 흐름과 권장 대출금을 볼 수 있어요."}
                </p>
                <dl className="mt-4 space-y-2 border-t border-gov-line2 pt-3 text-[13px]">
                  <div className="flex gap-3">
                    <dt className="w-20 shrink-0 font-semibold text-gov-ink2">소속</dt>
                    <dd className="text-gov-ink2">{session.org}</dd>
                  </div>
                  <div className="flex gap-3">
                    <dt className="w-20 shrink-0 font-semibold text-gov-ink2">구분</dt>
                    <dd className="text-gov-ink2">{ROLE_LABEL[session.role]}용 화면</dd>
                  </div>
                </dl>
                <Link
                  href={ROLE_HOME[session.role]}
                  className="mt-4 flex min-h-11 items-center justify-center rounded-md bg-gov-head text-[13px] font-bold text-white shadow-sm hover:bg-gov-navy"
                >
                  {session.role === "bank" ? "심사 대시보드로" : "내 농가 화면으로"}
                </Link>
                <div className="mt-1 flex flex-wrap gap-x-4">
                  {(session.role === "bank"
                    ? [["대출 신청자 목록", "/bank/applicants"], ["Stress Test", "/bank/stress"]]
                    : [["농사 수입과 지출", "/app/revenue"], ["안전진단", "/app/safety"]]
                  ).map(([label, href]) => (
                    <Link key={href} href={href}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center text-[12px] text-gov-link hover:underline">
                      {label} →
                    </Link>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h2 className="sec-title mb-3">이용 안내</h2>
                <p className="text-[13px] leading-relaxed text-gov-ink2">
                  농가용과 금융기관용 화면이 따로 있어요. 같은 분석을 각자에게 필요한
                  형태로 보여 줍니다.
                </p>
                <dl className="mt-4 space-y-2 border-t border-gov-line2 pt-3 text-[13px]">
                  <div className="flex gap-3">
                    <dt className="w-20 shrink-0 font-semibold text-gov-ink2">농가</dt>
                    <dd className="text-gov-ink2">“2.3억원 이하 차입을 권장합니다”</dd>
                  </div>
                  <div className="flex gap-3">
                    <dt className="w-20 shrink-0 font-semibold text-gov-ink2">금융기관</dt>
                    <dd className="text-gov-ink2">
                      “3억원 대출 시 가격 하락 시나리오에서 갚는 데 쓸 돈 부족”
                    </dd>
                  </div>
                </dl>
                <Link href="/login"
                      className="mt-4 flex min-h-11 items-center justify-center rounded-md bg-gov-head text-[13px] font-bold text-white shadow-sm hover:bg-gov-navy">
                  로그인
                </Link>
                <p className="mt-2 text-[12px] text-gov-ink3">{DEMO_HINT}</p>
              </>
            )}
          </Panel>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-9">
        <AuctionSummary />
        {/* ── 이용 절차 ────────────────────────────────── */}
        <Section title="농장 정보부터 맞춤 처방까지">
          <ol className="grid gap-px bg-gov-line sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map(([n, t, d]) => (
              <li key={n} className="bg-white p-5">
                <span className="tabular text-[13px] font-extrabold text-gov-link">{n}</span>
                <h3 className="mt-1.5 text-[15px] font-bold text-gov-ink">{t}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-gov-ink2">{d}</p>
              </li>
            ))}
          </ol>
        </Section>

        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          <div>
            {/* ── 공지사항 ───────────────────────────── */}
            <Section
              title="공지사항"
              action={<Link href="/notice" className="inline-flex min-h-11 min-w-11 items-center justify-center text-[12px] text-gov-ink3 hover:text-gov-link">더보기 +</Link>}
            >
              <ul className="border-t border-gov-ink/70">
                {NOTICES.slice(0, 4).map((n) => (
                  <li key={n.id} className="border-b border-gov-line2">
                    <Link href={`/notice#${n.id}`} className="flex min-h-11 items-center gap-3 px-1 py-2 hover:bg-gov-sunk">
                      <Badge tone={n.category === "제도반영" ? "info" : "plain"}>{n.category}</Badge>
                      <span className="min-w-0 flex-1 truncate text-[14px] text-gov-ink">{n.title}</span>
                      <span className="tabular shrink-0 text-[12px] text-gov-ink3">{n.date}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 text-[12px] text-gov-ink3">
                이 목록은 서비스의 실제 변경 이력이에요. 정부 발표나 보도자료를 옮겨 싣지 않습니다.
              </p>
            </Section>

            {/* ── 핵심 기능 ───────────────────────────── */}
            <Section title="주요 기능">
              <div className="grid gap-px bg-gov-line sm:grid-cols-3">
                {[
                  ["농사 수입과 지출", "/app/revenue", "월별 들어오고 나가는 돈과 운전자금이 부족해지는 달"],
                  ["금융 안전진단", "/app/safety", "가격↓·생산량↓·금리↑·재해 시나리오"],
                  ["맞춤 금융지원", "/app/finance", "권장 대출금 계산"],
                ].map(([t, href, d]) => (
                  <Link key={href} href={href} className="group bg-white p-5 transition-colors hover:bg-gov-sunk">
                    <h3 className="text-[15px] font-bold text-gov-ink group-hover:text-gov-head">
                      {t} →
                    </h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-gov-ink2">{d}</p>
                  </Link>
                ))}
              </div>
            </Section>
          </div>

          <div className="space-y-8">
            <Section title="데이터 현황" action={<Link href="/stats" className="inline-flex min-h-11 min-w-11 items-center justify-center text-[12px] text-gov-ink3 hover:text-gov-link">자세히 +</Link>}>
              <Panel>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Stat label="작목" value={cropCount?.toString() ?? "—"} unit="종" />
                  <Stat label="지침 조항" value="709" unit="개" />
                  <Stat label="시행지침" value="3" unit="종" />
                  <Stat label="시뮬레이션" value="3만" unit="회" />
                </div>
                <p className="mt-4 border-t border-gov-line2 pt-3 text-[12px] leading-relaxed text-gov-ink3">
                  소득·농사 비용는 농촌진흥청 농산물소득조사, 도매가격은 KAMIS,
                  제도는 농림축산식품부 2026년 시행지침을 써요.
                </p>
              </Panel>
            </Section>

            <Section title="바로가기">
              <ul className="border-t border-gov-ink/70">
                {[
                  ["자료실 — 시행지침 원문", "/library"],
                  ["자주 묻는 질문", "/faq"],
                  ["용어사전", "/glossary"],
                  ["작목 데이터", "/crops"],
                  ["가격과 시장 흐름", "/market"],
                ].map(([t, href]) => (
                  <li key={href} className="border-b border-gov-line2">
                    <Link href={href} className="flex min-h-11 items-center justify-between px-1 text-[13px] text-gov-ink2 hover:bg-gov-sunk hover:text-gov-head">
                      {t}
                      <span aria-hidden className="text-gov-ink3">›</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          </div>
        </div>
      </div>
    </main>
  );
}
