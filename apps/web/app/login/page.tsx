"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Btn, Crumb, Notice, Page, PageTitle, Panel } from "@/components/gov";
import { DEMO_HINT, ROLE_LABEL, signIn, type Role } from "@/lib/auth";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [role, setRole] = useState<Role>("farmer");
  const [error, setError] = useState<string | null>(null);

  const field =
    "w-full border border-gov-line px-3.5 py-2.5 text-[14px] outline-none focus:border-gov-link";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn(id, pw, role)) {
      setError("아이디 또는 비밀번호가 맞지 않습니다.");
      return;
    }
    const next = params.get("next");
    router.push(next && next.startsWith("/") ? next : role === "bank" ? "/bank" : "/app");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      <Panel>
        <h2 className="sec-title mb-4">로그인</h2>
        <form onSubmit={submit} className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-[13px] font-semibold text-gov-ink2">이용 구분</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["farmer", "bank"] as Role[]).map((r) => (
                <label
                  key={r}
                  className={`cursor-pointer border px-3 py-2.5 text-center text-[13px] font-semibold ${
                    role === r
                      ? "border-gov-head bg-gov-soft text-gov-head"
                      : "border-gov-line text-gov-ink2 hover:border-gov-link"
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r}
                    checked={role === r}
                    onChange={() => setRole(r)}
                    className="sr-only"
                  />
                  {ROLE_LABEL[r]}
                </label>
              ))}
            </div>
          </fieldset>

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
            <p role="alert" className="border-l-4 border-gov-point bg-gov-point/5 px-3 py-2 text-[12px] text-gov-point">
              {error}
            </p>
          )}

          <button type="submit" className="w-full bg-gov-head py-3 text-[14px] font-bold text-white hover:bg-gov-navy">
            로그인
          </button>
        </form>

        <div className="mt-5 border-t border-gov-line2 pt-4">
          <Notice tone="info" title="데모 계정">
            {DEMO_HINT}
            <br />
            같은 계정으로 농가용·금융기관용 두 화면을 모두 볼 수 있습니다. 로그인 후에도
            상단 탭으로 전환됩니다.
          </Notice>
        </div>
      </Panel>

      <div className="space-y-5">
        <Panel>
          <h2 className="sec-title mb-3">로그인하면 이런 걸 볼 수 있습니다</h2>
          <ul className="space-y-2.5 text-[13px] leading-relaxed text-gov-ink2">
            {[
              ["수익 전망", "작목·면적을 넣으면 예상 매출과 월별 현금흐름, 운전자금이 부족해지는 달을 짚습니다."],
              ["금융 안전진단", "가격이 20% 떨어지거나 생산량이 30% 줄면 상환이 가능한지 시나리오별로 계산합니다."],
              ["맞춤 금융지원", "제도상 신청 가능한 한도가 아니라, 실제로 감당할 수 있는 차입 규모를 역산합니다."],
              ["구제제도", "거치 후반기에 상환 위기가 예상되면 연체 전에 이용 가능한 제도를 안내합니다."],
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
            제도 근거 검색과 작목 데이터는 누구나 볼 수 있습니다.
          </p>
          <div className="flex flex-wrap gap-2">
            <Btn href="/policy" variant="ghost">제도 근거 검색</Btn>
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
        lead="농가용과 금융기관용 화면을 이용하려면 로그인이 필요합니다."
      />
      <div id="main">
        <Suspense fallback={<p className="text-[14px] text-gov-ink2">불러오는 중…</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </Page>
  );
}
