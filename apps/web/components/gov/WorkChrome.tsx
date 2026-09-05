"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BANK, FARMER, FARMER_DETAIL, FARMER_STEPS } from "@/lib/nav";
import { ROLE_LABEL } from "@/lib/auth";
import { useSession } from "@/lib/useSession";

/** 업무 영역 크롬 — 역할 전환 탭 + 좌측 메뉴.
 *
 * 같은 엔진의 결과를 농가와 금융기관에 서로 다른 관점으로 낸다.
 * 정부 사이트의 「개인 / 기업」 탭과 같은 자리다.
 */
export default function WorkChrome({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => { setMobileMenuOpen(false); }, [path]);
  const router = useRouter();
  const { session, ready } = useSession();

  const isReport = path.startsWith("/result/");
  // 리포트는 양쪽에서 다 열린다. 역할로 메뉴를 고르고 리다이렉트는 걸지 않는다.
  const isBank = isReport ? session?.role === "bank" : path.startsWith("/bank");

  useEffect(() => {
    // 하이드레이션 전에는 세션이 null 로 보인다 — 그때 판단하면 로그인해도 튕긴다.
    if (!ready) return;
    if (!session) {
      router.replace(`/login?next=${encodeURIComponent(path)}`);
      return;
    }
    if (isReport) return; // 리포트는 두 역할 모두 볼 수 있다
    // 계정이 역할을 정한다. 농가 계정으로 심사 화면에 들어갈 수 없다.
    if (isBank && session.role !== "bank") router.replace("/app");
    if (!isBank && session.role !== "farmer") router.replace("/bank");
  }, [path, router, session, isBank, ready, isReport]);

  if (!ready) return null;
  if (!session) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-center text-[14px] text-gov-ink2">
        로그인 화면으로 이동합니다…
      </div>
    );
  }

  const menu = isBank ? BANK : FARMER;

  return (
    <div className="border-b border-gov-line bg-white">
      {/* 역할 전환 */}
      <div className="border-b border-gov-line bg-gov-sunk">
        <div className="mx-auto flex max-w-6xl flex-wrap items-stretch gap-2 px-4">
          <div className="-mb-px border-b-2 border-gov-head bg-white px-5 py-3">
            <span className="block text-[14px] font-bold text-gov-head">
              {session.role === "bank" ? "금융기관용" : "농가용"}
            </span>
            <span className="hidden text-[12px] text-gov-ink3 sm:block">
              {session.role === "bank"
                ? "대출 갚을 능력 살펴보기와 대출 금액 계획"
                : "내 경영 상태와 권장 대출금"}
            </span>
          </div>
          <div className="ml-auto flex min-w-0 flex-wrap items-center py-2 text-[12px] text-gov-ink3">
            {ROLE_LABEL[session.role]} · {session.org} · {session.name}
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-6xl gap-7 px-4">
        <nav aria-label="업무 메뉴" className="hidden w-52 shrink-0 border-r border-gov-line2 py-6 lg:block">
          {/* 농가용은 명세의 5단계가 곧 메뉴다. 번호를 붙여 순서를 보이게 한다. */}
          {session.role !== "bank" && (
            <>
              <Link
                href="/app"
                aria-current={path === "/app" ? "page" : undefined}
                className={`flex min-h-11 items-center border-l-[3px] py-2.5 pl-3 pr-2 text-[13px] ${
                  path === "/app"
                    ? "border-gov-head bg-gov-soft font-semibold text-gov-head"
                    : "border-transparent text-gov-ink2 hover:bg-gov-sunk hover:text-gov-ink"
                }`}
              >
                홈
              </Link>
              <ol className="mt-1">
                {FARMER_STEPS.map((i, n) => {
                  const active = path.startsWith(i.href);
                  return (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        aria-current={active ? "page" : undefined}
                        className={`flex gap-2 border-l-[3px] py-2.5 pl-3 pr-2 ${
                          active
                            ? "border-gov-head bg-gov-soft font-semibold text-gov-head"
                            : "border-transparent text-gov-ink2 hover:bg-gov-sunk hover:text-gov-ink"
                        }`}
                      >
                        <span
                          aria-hidden
                          className={`mt-px inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
                            active ? "bg-gov-head text-white" : "bg-gov-sunk text-gov-ink2"
                          }`}
                        >
                          {n + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] leading-tight">{i.label}</span>
                          {i.desc && (
                            <span className="block text-[12px] text-gov-ink3">{i.desc}</span>
                          )}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-5 px-3 text-[12px] font-semibold tracking-wide text-gov-ink2">
                자세히 보기
              </p>
              <ul>
                {FARMER_DETAIL.map((i) => {
                  const active = isReport
                    ? i.href.endsWith("/reports")
                    : path.startsWith(i.href);
                  return (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        aria-current={active ? "page" : undefined}
                        className={`flex min-h-11 items-center border-l-[3px] py-2 pl-3 pr-2 text-[13px] ${
                          active
                            ? "border-gov-head bg-gov-soft font-semibold text-gov-head"
                            : "border-transparent text-gov-ink2 hover:bg-gov-sunk hover:text-gov-ink"
                        }`}
                      >
                        {i.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <ul className={session.role === "bank" ? "" : "hidden"}>
            {menu.map((i) => {
              const active = isReport
                ? i.href.endsWith("/reports")
                : i.href === "/app" || i.href === "/bank"
                  ? path === i.href
                  : path.startsWith(i.href);
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    aria-current={active ? "page" : undefined}
                    className={`block border-l-[3px] py-2.5 pl-3 pr-2 ${
                      active
                        ? "border-gov-head bg-gov-soft font-semibold text-gov-head"
                        : "border-transparent text-gov-ink2 hover:bg-gov-sunk hover:text-gov-ink"
                    }`}
                  >
                    <span className="block text-[13px] leading-tight">{i.label}</span>
                    {i.desc && <span className="block text-[12px] text-gov-ink3">{i.desc}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 flex-1 py-6">
          {/* 좁은 화면용 */}
          <nav aria-label="업무 메뉴 (모바일)" className="mb-5 lg:hidden">
            <button type="button" aria-expanded={mobileMenuOpen} aria-controls="mobile-work-menu"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border border-gov-line bg-gov-sunk px-4 py-3 text-left text-[14px] font-semibold text-gov-head">
              <span>{menu.find((i) => i.href === path)?.label ?? "내 농장 메뉴"}</span>
              <span className="shrink-0 text-[12px]">{mobileMenuOpen ? "메뉴 닫기 −" : "메뉴 보기 +"}</span>
            </button>
            <ul id="mobile-work-menu" hidden={!mobileMenuOpen} className="mt-2 rounded-lg border border-gov-line bg-white p-2">
              {menu.map((i) => {
                const active = isReport ? i.href.endsWith("/reports") : path === i.href;
                const step = FARMER_STEPS.findIndex((s) => s.href === i.href);
                return (
                  <li key={i.href}>
                    <Link href={i.href} aria-current={active ? "page" : undefined}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex min-h-12 items-center gap-3 rounded-md px-3 py-3 text-[14px] ${
                        active ? "bg-gov-soft font-semibold text-gov-head" : "text-gov-ink2 hover:bg-gov-sunk"}`}>
                      {step >= 0 && <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gov-soft text-[12px]">{step + 1}</span>}
                      {i.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          {children}
          <details className="mt-8 rounded-lg border border-gov-line bg-gov-sunk px-4 py-2">
            <summary className="text-[14px] font-semibold text-gov-head">계산에 쓰인 말, 쉽게 알아보기</summary>
            <dl className="grid gap-4 py-3 text-[14px] sm:grid-cols-2">
              {[
                ["농사로 번 돈 (농업소득)", "농산물을 팔아 들어온 돈에서 농사 비용을 뺀 돈이에요. 생활비와 대출금은 아직 빼지 않았어요."],
                ["갚는 데 쓸 돈 (상환여력)", "농사로 번 돈에서 생활비와 기존 대출에 갚을 돈을 뺀 금액이에요. 지금 통장 잔액과는 달라요."],
                ["갚을 돈의 여유 (DSCR)", "갚는 데 쓸 돈을 갚아야 할 원금과 이자로 나눈 값이에요. 1보다 작으면 모자라요."],
                ["이자만 내는 기간 (거치기간)", "빌린 돈은 나중에 갚고 이자만 내는 기간이에요. 끝나면 원금도 함께 갚기 시작해요."],
                ["정책자금", "정부 지원 제도의 돈이에요. 갚아야 하는 대출과 갚지 않는 지원금은 달라요. 각 사업의 조건을 확인해야 해요."],
                ["소득 변동성 (σ)", "해마다 소득이 얼마나 흔들리는지 나타내요. 값이 클수록 소득 변화가 크다는 뜻이에요."],
              ].map(([term, meaning]) => (
                <div key={term}><dt className="font-semibold text-gov-ink">{term}</dt><dd className="mt-1 leading-relaxed text-gov-ink2">{meaning}</dd></div>
              ))}
            </dl>
            <Link href="/glossary" className="lnk inline-flex min-h-11 items-center text-[14px]">다른 용어도 알아보기 →</Link>
          </details>
        </div>
      </div>
    </div>
  );
}
