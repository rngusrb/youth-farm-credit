import type { Metadata } from "next";
import SiteChrome from "@/components/gov/SiteChrome";
import "./globals.css";

export const metadata: Metadata = {
  title: "Seed Money — 농장 살림 · 대출 계획 서비스",
  description:
    "얼마까지 받을 수 있는가가 아니라, 얼마까지 받아야 안전한가. 농가의 경영 데이터로 미래 돈의 흐름과 갚는 데 쓸 돈을 계산합니다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning — 브라우저 확장이 <html> 에 속성을 심으면
    // (예: data-vp-extension) 서버 HTML 과 달라져 하이드레이션 경고가 난다.
    // 우리가 만든 차이가 아니고 막을 수도 없다. 이 태그에만 좁게 끈다.
    <html lang="ko" suppressHydrationWarning>
      <body className="min-h-screen">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-gov-head focus:px-4 focus:py-2 focus:text-white">
          본문 바로가기
        </a>
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
