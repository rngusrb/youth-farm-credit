"use client";

import { usePathname } from "next/navigation";
import Header from "./Header";
import UtilBar from "./UtilBar";
import Footer from "./Footer";
import WorkChrome from "./WorkChrome";

/** 화면마다 크롬이 다르다.
 *   /result/…  리포트 — 인쇄물이므로 크롬 없음
 *   /app, /bank 업무 영역 — 역할 탭 + 좌측 메뉴
 *   그 외        공개 포털 — 상단 메뉴
 */
export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const path = usePathname();

  if (path.startsWith("/result/")) return <>{children}</>;

  const work = path.startsWith("/app") || path.startsWith("/bank");
  return (
    <>
      <UtilBar />
      {work ? (
        <>
          <Header />
          <WorkChrome>{children}</WorkChrome>
        </>
      ) : (
        <>
          <Header />
          {children}
        </>
      )}
      <Footer />
    </>
  );
}
