"use client";

import Link from "next/link";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Btn, Crumb, Page, PageTitle, Panel } from "@/components/gov";
import { signIn } from "@/lib/auth";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);

  const field =
    "w-full min-h-11 rounded-md border border-gov-line px-3.5 text-[14px] outline-none focus:border-gov-link";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // signIn 은 비동기다 — 가입 계정은 비밀번호를 해시로 대조하기 때문이다.
    const s = await signIn(id, pw);
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
          {/* 데모 계정 버튼을 화면에서 내렸다 (2026-09-07).
              계정 자체는 lib/auth.ts 에 그대로 있어 **아이디를 입력하면 로그인된다.**
              자격증명을 화면에 적어 두지 않기 위한 것이고, 계정 정보는 제출한
              기능명세서 §5 에 있다. 보이지 않을 뿐 막힌 것이 아니다. */}

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

        <p className="mt-4 text-[13px] text-gov-ink2">
          계정이 없으면{" "}
          <Link href="/signup" className="text-gov-link underline">가입</Link>
          하세요. 아이디와 비밀번호만 정하면 바로 쓸 수 있어요.
        </p>

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
        lead="가입한 계정으로 로그인하세요. 계정이 없으면 아래에서 만들 수 있어요."
      />
      <div id="main">
        <Suspense fallback={<p className="text-[14px] text-gov-ink2">불러오는 중…</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </Page>
  );
}
