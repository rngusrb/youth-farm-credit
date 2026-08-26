import type { Metadata } from "next";
import { Noto_Serif_KR } from "next/font/google";
import Sidebar from "@/components/shell/Sidebar";
import MobileNav from "@/components/shell/MobileNav";
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
        <div className="flex">
          <Sidebar />
          <div className="min-w-0 flex-1 pb-16 lg:pb-0">{children}</div>
        </div>
        <MobileNav />
      </body>
    </html>
  );
}
