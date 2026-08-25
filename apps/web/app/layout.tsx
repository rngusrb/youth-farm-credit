import type { Metadata } from "next";
import { Noto_Serif_KR } from "next/font/google";
import "./globals.css";

// 리포트 표제용 세리프. next/font 가 자체 호스팅하므로 외부 요청이 없다.
const serif = Noto_Serif_KR({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "청년농 여신 설계 | 내가 갚을 수 있는 만큼",
  description:
    "청년 농업인이 정책자금을 신청하기 전에, 감당할 수 있는 차입 규모를 스스로 계산하고 상환 위험을 미리 확인하는 서비스.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={serif.variable}>
      <body className="min-h-screen">
        <header className="border-b border-ink-800">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
            <a href="/" className="font-semibold tracking-tight">
              청년농 여신 설계
            </a>
            <a
              href="/"
              className="text-sm text-slate-400 transition hover:text-slate-100"
            >
              새 진단
            </a>
          </div>
        </header>
        {children}
        <footer className="mt-20 border-t border-ink-800">
          <div className="mx-auto max-w-5xl px-5 py-8 text-xs leading-relaxed text-slate-500">
            <p>
              이 서비스는 부도 예측·신용평가·대출 알선·상품 추천을 하지 않습니다. 모든
              금액과 확률은 공개 통계와 제도 파라미터로 계산한 참고자료이며 대출 심사
              결과가 아닙니다.
            </p>
            <p className="mt-2">
              소득: 농촌진흥청 2023년 농산물 소득조사 · 부채 실태: KREI 『농업경영체의
              부채 실태와 정책 과제』 R2025-09
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
