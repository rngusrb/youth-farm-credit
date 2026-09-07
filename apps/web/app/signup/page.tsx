"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Btn, Crumb, Notice, Page, PageTitle, Panel } from "@/components/gov";
import { ROLE_LABEL, signIn, signUp, type Role } from "@/lib/auth";

/** 가입 — **브라우저 안에서만** 저장한다.
 *
 * 서버도 DB 도 두지 않는다. 제출한 기능명세서가 "서버에 보관하지 않고 브라우저에만
 * 저장" 이라고 적고 있어서, 가입을 서버에 붙이면 그 문서가 거짓이 된다. (2026-09-07)
 *
 * 그래서 이 화면은 **다른 기기에서는 로그인되지 않는다.** 그 사실을 숨기지 않고 적는다 —
 * 안 적으면 사용자가 "가입했는데 안 된다" 고 겪고서야 알게 된다.
 */
export default function SignUpPage() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [role, setRole] = useState<Role>("farmer");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw !== pw2) {
      setError("비밀번호가 서로 달라요.");
      return;
    }
    setBusy(true);
    try {
      const why = await signUp({ id, pw, name, org, role });
      if (why) {
        setError(why);
        return;
      }
      // 가입 직후 바로 들어간다. 다시 로그인시키면 방금 정한 값을 또 치게 된다.
      const s = await signIn(id, pw);
      router.replace(s?.role === "bank" ? "/bank" : "/app");
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "가입하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  // 로그인 화면과 같은 값을 쓴다. min-h-11 이 없으면 터치 대상 44px 미달로
  // ui_check 가 잡는다 (WCAG 2.5.5). 실제로 5건 걸렸다 (2026-09-07).
  const field =
    "w-full min-h-11 rounded-md border border-gov-line px-3.5 text-[14px] outline-none focus:border-gov-link";
  const label = "mb-1.5 block text-[13px] font-semibold text-gov-ink2";

  return (
    <Page>
      <Crumb trail={[{ label: "가입" }]} />
      <PageTitle title="가입" lead="아이디와 비밀번호를 정하면 바로 쓸 수 있어요." />
      {/* 로그인 화면과 같은 2단 구성. 폼을 화면 폭 전체로 늘리면 입력란이
          1,900px 짜리 줄이 되어 읽기 어렵다 (2026-09-07 확인). */}
      <div id="main" className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <Panel>
          <h2 className="sec-title mb-4">계정 만들기</h2>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <span className={label}>어떤 화면을 쓰시나요</span>
              <div className="grid gap-2 sm:grid-cols-2">
                {(["farmer", "bank"] as Role[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    aria-pressed={role === r}
                    className={`min-h-11 rounded-md border px-3 py-2 text-[14px] ${
                      role === r
                        ? "border-gov-head bg-gov-soft font-bold text-gov-head"
                        : "border-gov-line text-gov-ink2 hover:border-gov-link"
                    }`}
                  >
                    {ROLE_LABEL[r]}용
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[12px] text-gov-ink3">
                <b>계정이 역할을 정합니다</b> — 로그인 뒤에는 화면에서 바꿀 수 없어요.
              </p>
            </div>

            <div>
              <label htmlFor="sid" className={label}>아이디 (3자 이상)</label>
              <input id="sid" className={field} value={id} autoComplete="username"
                     onChange={(e) => setId(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="sname" className={label}>이름</label>
              <input id="sname" className={field} value={name}
                     onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="sorg" className={label}>소속 (선택)</label>
              <input id="sorg" className={field} value={org}
                     placeholder={role === "farmer" ? "개인 농가" : "금융기관"}
                     onChange={(e) => setOrg(e.target.value)} />
            </div>
            <div>
              <label htmlFor="spw" className={label}>비밀번호 (6자 이상)</label>
              <input id="spw" type="password" className={field} value={pw} autoComplete="new-password"
                     onChange={(e) => setPw(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="spw2" className={label}>비밀번호 확인</label>
              <input id="spw2" type="password" className={field} value={pw2} autoComplete="new-password"
                     onChange={(e) => setPw2(e.target.value)} required />
            </div>

            {error && <Notice tone="warn" title="가입하지 못했어요">{error}</Notice>}

            <Btn type="submit" disabled={busy}>
              {busy ? "만드는 중…" : "가입하고 시작하기"}
            </Btn>
          </form>

          <div className="mt-5 border-t border-gov-line2 pt-4">
            <Notice tone="warn" title="이 계정은 이 브라우저에만 저장돼요">
              서버에 보내지 않습니다. 그래서 다른 기기나 다른 브라우저에서는 로그인되지
              않고, 방문 기록을 지우면 계정도 함께 사라져요. 실제 인증이 아니므로
              진짜 개인정보나 금융정보는 넣지 마세요.
            </Notice>
          </div>

          <p className="mt-3 text-[13px] text-gov-ink2">
            이미 계정이 있으면{" "}
            <Link href="/login" className="text-gov-link underline">로그인</Link>
            하세요.
          </p>
        </Panel>

        <Panel>
          <h2 className="sec-title mb-3">가입하면 이런 걸 볼 수 있어요</h2>
          <ul className="space-y-2 text-[14px] leading-relaxed text-gov-ink2">
            <li>· <b className="text-gov-ink">AI 농가 건강검진</b> — 내 소득이 같은 작목 전국 평균과 견줘 어디쯤인지</li>
            <li>· <b className="text-gov-ink">AI 농사 자금지도</b> — 어느 달에 돈이 마르고, 몇 년차에 부담이 뛰는지</li>
            <li>· <b className="text-gov-ink">금융 안전진단</b> — 값이 얼마나 떨어지는 데까지 버틸 수 있는지</li>
            <li>· <b className="text-gov-ink">AI 농가 상담사</b> — 물어보면 필요한 계산을 골라 실행하고 답합니다</li>
            <li>· <b className="text-gov-ink">AI 맞춤 처방</b> — 조건 조정안, 작목 전환, 신청서 초안</li>
          </ul>
          <p className="mt-4 text-[13px] leading-relaxed text-gov-ink3">
            작목·면적·생활비 세 가지만 있으면 시작할 수 있어요. 로그인 없이도
            제도 근거 검색과 작목 데이터는 볼 수 있습니다.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Btn href="/policy" variant="ghost">지원 제도 찾아보기</Btn>
            <Btn href="/crops" variant="ghost">작목 데이터</Btn>
          </div>
        </Panel>
      </div>
    </Page>
  );
}
