"use client";

import { usePathname } from "next/navigation";
import Header from "./Header";
import UtilBar from "./UtilBar";
import Footer from "./Footer";
import WorkChrome from "./WorkChrome";
import { useSession } from "@/lib/useSession";

/** 화면마다 크롬이 다르다.
 *   /app, /bank   업무 영역 — 역할 탭 + 좌측 메뉴
 *   /result/…     리포트 — **업무 화면 안에서** 연다. 로그인 전이면 공개 포털 크롬.
 *   그 외          공개 포털 — 상단 메뉴
 *
 * 리포트를 크롬 없이 띄웠더니 사이드바도 헤더도 사라져 "다른 서비스로 넘어간" 느낌이
 * 났다. 같은 창 안에서 열리도록 바꿨다. 인쇄할 때는 `.no-print` 로 크롬이 빠진다.
 */
export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { session, ready } = useSession();

  const isReport = path.startsWith("/result/");
  // 리포트는 로그인한 사람에게만 업무 크롬을 씌운다 — 공유 링크로 들어온
  // 비로그인 방문자를 로그인 화면으로 튕기면 링크가 죽는다.
  const work =
    path.startsWith("/app") || path.startsWith("/bank") || (isReport && ready && !!session);
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
