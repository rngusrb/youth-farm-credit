import Link from "next/link";
import { Crumb, Page, PageTitle, Panel } from "@/components/gov";
import { BANK, FARMER, PORTAL } from "@/lib/nav";

export const metadata = { title: "사이트맵 | FarmFit" };

export default function SitemapPage() {
  const groups = [
    ...PORTAL,
    { label: "농가용 (로그인 필요)", items: FARMER },
    { label: "금융기관용 (로그인 필요)", items: BANK },
  ];
  return (
    <Page>
      <Crumb trail={[{ label: "사이트맵" }]} />
      <PageTitle title="사이트맵" lead="전체 메뉴를 한눈에 봅니다." />
      <div id="main" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => (
          <Panel key={g.label}>
            <h2 className="sec-title mb-3">{g.label}</h2>
            <ul className="space-y-1.5">
              {g.items.map((i) => (
                <li key={i.href}>
                  <Link href={i.href} className="text-[13px] text-gov-ink2 hover:text-gov-link">
                    {i.label}
                  </Link>
                  {i.desc && <span className="block text-[11px] text-gov-ink3">{i.desc}</span>}
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>
    </Page>
  );
}
