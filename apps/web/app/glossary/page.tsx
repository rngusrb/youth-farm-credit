import { Crumb, Page, PageTitle, Panel } from "@/components/gov";
import { GLOSSARY } from "@/lib/content";

export const metadata = { title: "용어사전 | FarmFit" };

export default function GlossaryPage() {
  return (
    <Page>
      <Crumb trail={[{ label: "제도 · 자료" }, { label: "용어사전" }]} />
      <PageTitle
        title="용어사전"
        lead="이 서비스가 실제로 쓰는 계산의 정의만 싣습니다. 화면에 나오는 숫자가 무슨 뜻인지 여기서 확인하실 수 있습니다."
      />

      <nav aria-label="용어 목록" className="mb-6 flex flex-wrap gap-1.5">
        {GLOSSARY.map((t) => (
          <a key={t.term} href={`#${encodeURIComponent(t.term)}`}
             className="rounded-lg border border-gov-line bg-white px-2.5 py-1 text-[12px] text-gov-ink2 hover:border-gov-link hover:text-gov-head">
            {t.term.split(" ")[0]}
          </a>
        ))}
      </nav>

      <div id="main" className="space-y-4">
        {GLOSSARY.map((t) => (
          <Panel key={t.term}>
            <article id={encodeURIComponent(t.term)} className="scroll-mt-24">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-[16px] font-bold text-gov-ink">{t.term}</h2>
                <p className="text-[13px] font-medium text-gov-link">{t.short}</p>
              </div>
              <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-gov-ink2">{t.body}</p>
              {t.related && (
                <p className="mt-2.5 text-[12px] text-gov-ink3">
                  관련 용어 ·{" "}
                  {t.related.map((r, i) => (
                    <span key={r}>
                      {i > 0 && ", "}
                      <a href={`#${encodeURIComponent(GLOSSARY.find((g) => g.term.startsWith(r))?.term ?? r)}`} className="lnk">
                        {r}
                      </a>
                    </span>
                  ))}
                </p>
              )}
            </article>
          </Panel>
        ))}
      </div>
    </Page>
  );
}
