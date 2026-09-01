import { Badge, Crumb, Page, PageTitle, Panel } from "@/components/gov";
import { NOTICES } from "@/lib/content";

export const metadata = { title: "공지사항 | Seed Money" };

export default function NoticePage() {
  return (
    <Page>
      <Crumb trail={[{ label: "알림" }, { label: "공지사항" }]} />
      <PageTitle
        title="공지사항"
        lead="이 서비스에 실제로 반영된 변경 이력입니다. 정부 발표나 보도자료를 옮겨 싣지 않습니다 — 지어낸 소식으로 화면을 채우지 않기 위해서입니다."
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
