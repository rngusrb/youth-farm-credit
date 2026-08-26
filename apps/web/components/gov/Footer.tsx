import Link from "next/link";
import { PORTAL } from "@/lib/nav";

const LINKS = [
  { label: "농림축산식품부", href: "https://www.mafra.go.kr" },
  { label: "KAMIS 농산물유통정보", href: "https://www.kamis.or.kr" },
  { label: "KOSIS 국가통계포털", href: "https://kosis.kr" },
  { label: "공공데이터포털", href: "https://www.data.go.kr" },
];

export default function Footer() {
  return (
    <footer className="no-print mt-16 border-t border-gov-line bg-white">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid gap-6 border-b border-gov-line2 pb-6 sm:grid-cols-2 lg:grid-cols-4">
          {PORTAL.map((g) => (
            <div key={g.label}>
              <h3 className="mb-2 text-[13px] font-bold text-gov-ink">{g.label}</h3>
              <ul className="space-y-1">
                {g.items.map((i) => (
                  <li key={i.href}>
                    <Link href={i.href} className="text-[12px] text-gov-ink2 hover:text-gov-link">
                      {i.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} target="_blank" rel="noreferrer"
               className="text-[12px] text-gov-ink3 hover:text-gov-link">
              {l.label} ↗
            </a>
          ))}
        </div>
      </div>

      <div className="bg-gov-navy py-5 text-white/70">
        <div className="mx-auto max-w-6xl px-4 text-[11px] leading-relaxed">
          <p className="font-semibold text-white/90">
            이 서비스는 부도 예측·신용평가·대출 알선·상품 추천을 하지 않습니다.
          </p>
          <p className="mt-1">
            모든 금액과 확률은 공개 통계와 제도 파라미터로 계산한 참고자료이며 대출 심사
            결과가 아닙니다. 실제 대출 가능 여부와 조건은 사업 시행기관과 취급 금융기관의
            심사로 결정됩니다.
          </p>
          <p className="mt-2 text-white/50">
            소득·경영비: 농촌진흥청 농산물소득조사(KOSIS) · 도매가격: KAMIS ·
            제도: 농림축산식품부 2026년 시행지침
          </p>
        </div>
      </div>
    </footer>
  );
}
