"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Btn, Crumb, Notice, Page, PageTitle, Panel } from "@/components/gov";
import { DEMO_ACCOUNTS, ROLE_LABEL, signIn } from "@/lib/auth";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);

  const field =
    "w-full min-h-11 rounded-md border border-gov-line px-3.5 text-[14px] outline-none focus:border-gov-link";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const s = signIn(id, pw);
    if (!s) {
      setError("아이디 또는 비밀번호가 맞지 않습니다.");
      return;
    }
    // 갈 곳은 **계정의 역할**이 정한다. 화면에서 고르게 두면 농가 계정으로도
    // 심사 화면에 들어갈 수 있어 역할 분리가 의미를 잃는다.
    const home = s.role === "bank" ? "/bank" : "/app";
    const next = params.get("next");
    const allowed =
      next &&
      next.startsWith("/") &&
      (s.role === "bank" ? next.startsWith("/bank") : next.startsWith("/app"));
    router.push(allowed ? next : home);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      <Panel>
        <h2 className="sec-title mb-4">로그인</h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <p className="mb-2 text-[13px] font-semibold text-gov-ink2">데모 계정</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => { setId(a.id); setPw(a.pw); setError(null); }}
                  className="flex min-h-11 flex-col justify-center rounded-md border border-gov-line px-3 py-2 text-left transition hover:border-gov-link hover:bg-gov-soft"
                >
                  <span className="text-[13px] font-bold text-gov-ink">{ROLE_LABEL[a.role]}</span>
                  <span className="tabular text-[12px] text-gov-ink3">{a.id} / {a.pw}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-gov-ink3">
              눌러서 채운 뒤 로그인하세요. <b>계정이 역할을 정합니다</b> — 화면에서 고를 수 없습니다.
            </p>
          </div>

          <div>
            <label htmlFor="uid" className="mb-1.5 block text-[13px] font-semibold text-gov-ink2">
              아이디 <span className="text-gov-point">*</span>
            </label>
            <input id="uid" value={id} onChange={(e) => setId(e.target.value)}
                   autoComplete="username" className={field} />
          </div>
          <div>
            <label htmlFor="upw" className="mb-1.5 block text-[13px] font-semibold text-gov-ink2">
              비밀번호 <span className="text-gov-point">*</span>
            </label>
            <input id="upw" type="password" value={pw} onChange={(e) => setPw(e.target.value)}
                   autoComplete="current-password" className={field} />
          </div>

          {error && (
            <p role="alert" className="rounded-r-md border-l-4 border-gov-point bg-gov-point/5 px-3 py-2 text-[12px] text-gov-point">
              {error}
            </p>
          )}

          <button type="submit" className="w-full rounded-md bg-gov-head py-3 text-[14px] font-bold text-white shadow-sm hover:bg-gov-navy">
            로그인
          </button>
        </form>

        <div className="mt-5 border-t border-gov-line2 pt-4">
          <Notice tone="warn" title="실제 인증이 아닙니다">
            아이디·비밀번호가 코드에 그대로 있고 검증도 브라우저에서 합니다. 화면 흐름을
            보여주기 위한 데모 장치이며 이 상태로 운영에 쓸 수 없습니다.
          </Notice>
        </div>
      </Panel>

      <div className="space-y-5">
        <Panel>
          <h2 className="sec-title mb-3">로그인하면 이런 걸 볼 수 있습니다</h2>
          <ul className="space-y-2.5 text-[13px] leading-relaxed text-gov-ink2">
            {[
              ["농사 수입과 지출", "키우는 작물과 면적을 넣으면 들어올 돈과 나갈 돈을 월별로 볼 수 있어요."],
              ["금융 안전진단", "가격이 20% 떨어지거나 수확량이 30% 줄어도 대출을 갚을 수 있을지 계산해요."],
              ["맞춤 금융지원", "제도상 신청 가능한 한도가 아니라, 실제로 감당할 수 있는 빌리는 금액을 역산합니다."],
              ["어려울 때 받을 도움", "대출 갚기가 어려워지기 전에 받을 수 있는 도움을 찾아봐요."],
            ].map(([k, v]) => (
              <li key={k} className="flex gap-2.5">
                <span className="mt-[3px] h-1.5 w-1.5 shrink-0 bg-gov-head" aria-hidden />
                <span>
                  <b className="text-gov-ink">{k}</b> — {v}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <h2 className="sec-title mb-3">로그인 없이도 이용할 수 있습니다</h2>
          <p className="mb-3 text-[13px] leading-relaxed text-gov-ink2">
            지원 제도 찾아보기와 작목 데이터는 누구나 볼 수 있습니다.
          </p>
          <div className="flex flex-wrap gap-2">
            <Btn href="/policy" variant="ghost">지원 제도 찾아보기</Btn>
            <Btn href="/crops" variant="ghost">작목 데이터</Btn>
            <Btn href="/faq" variant="ghost">자주 묻는 질문</Btn>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Page>
      <Crumb trail={[{ label: "로그인" }]} />
      <PageTitle
        title="로그인"
        lead="농가용 또는 금융기관용 체험 계정으로 시작해 보세요."
      />
      <div id="main">
        <Suspense fallback={<p className="text-[14px] text-gov-ink2">불러오는 중…</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </Page>
  );
}
