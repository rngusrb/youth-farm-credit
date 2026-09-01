import type { Metadata } from "next";
import { Noto_Serif_KR } from "next/font/google";
import SiteChrome from "@/components/gov/SiteChrome";
import "./globals.css";

// 리포트 표제용 세리프. next/font 가 자체 호스팅하므로 외부 요청이 없다.
const serif = Noto_Serif_KR({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Seed Money — 농가 경영 · 여신설계 서비스",
  description:
    "얼마까지 받을 수 있는가가 아니라, 얼마까지 받아야 안전한가. 농가의 경영 데이터로 미래 현금흐름과 상환여력을 계산합니다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning — 브라우저 확장이 <html> 에 속성을 심으면
    // (예: data-vp-extension) 서버 HTML 과 달라져 하이드레이션 경고가 난다.
    // 우리가 만든 차이가 아니고 막을 수도 없다. 이 태그에만 좁게 끈다.
    <html lang="ko" className={serif.variable} suppressHydrationWarning>
      <body className="min-h-screen">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-gov-head focus:px-4 focus:py-2 focus:text-white">
          본문 바로가기
        </a>
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
