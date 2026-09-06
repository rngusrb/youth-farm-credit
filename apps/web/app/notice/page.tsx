import { Badge, Crumb, Page, PageTitle, Panel } from "@/components/gov";
import { NOTICES } from "@/lib/content";

export const metadata = { title: "공지사항 | Seed Money" };

export default function NoticePage() {
  return (
    <Page>
      <Crumb trail={[{ label: "알림" }, { label: "공지사항" }]} />
      <PageTitle
        title="공지사항"
        lead="새로 추가된 기능과 달라진 내용을 확인해 보세요. 이 서비스의 업데이트 소식이에요."
      />
      <div id="main" className="space-y-5">
        {NOTICES.map((n) => (
          <Panel key={n.id}>
            <article id={n.id} className="scroll-mt-24">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone={n.category === "제도반영" ? "info" : n.category === "품질" ? "warn" : "plain"}>
                  {n.category}
                </Badge>
                <time className="tabular text-[12px] text-gov-ink3" dateTime={n.date}>{n.date}</time>
              </div>
              <h2 className="text-[17px] font-bold leading-snug text-gov-ink">{n.title}</h2>
              <div className="mt-3 space-y-2">
                {n.body.map((p, i) => (
                  <p key={i} className="text-[14px] leading-relaxed text-gov-ink2">{p}</p>
                ))}
              </div>
            </article>
          </Panel>
        ))}
      </div>
    </Page>
  );
}
