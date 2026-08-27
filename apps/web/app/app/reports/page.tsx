"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Empty, Notice, PageTitle } from "@/components/gov";
import { loadReports, removeReport, type SavedReport } from "@/lib/profile";
import { pct, pyeong as fmtPyeong, won } from "@/lib/format";

export default function ReportsPage() {
  const [rows, setRows] = useState<SavedReport[]>([]);
  useEffect(() => {
    setRows(loadReports());
  }, []);

  return (
    <>
      <PageTitle
        title="내 리포트"
        lead="진단 결과는 서버에 저장되지 않아요. 문서번호(URL)에 입력값이 들어 있어 링크만 있으면 언제든 같은 리포트가 다시 계산돼요. 이 목록은 이 브라우저의 기록이에요."
      />

      {rows.length === 0 ? (
        <Empty title="아직 저장된 리포트가 없어요"
               body="진단을 실행하면 여기에 남아요. 링크를 복사해 두면 다른 기기에서도 같은 리포트를 열 수 있어요."
               cta={{ href: "/app/farm", label: "농가 정보 입력하고 진단" }} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-t border-gov-ink/70 text-[14px]">
            <thead>
              <tr className="bg-gov-sunk text-left text-[12px] font-semibold text-gov-ink2">
                <th scope="col" className="border-b border-gov-line px-4 py-3">작목 · 면적</th>
                <th scope="col" className="border-b border-gov-line px-4 py-3">정책자금</th>
                <th scope="col" className="border-b border-gov-line px-4 py-3">권장 차입</th>
                <th scope="col" className="border-b border-gov-line px-4 py-3">위기 확률</th>
                <th scope="col" className="border-b border-gov-line px-4 py-3">저장일</th>
                <th scope="col" className="border-b border-gov-line px-4 py-3"><span className="sr-only">관리</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-gov-line2 hover:bg-gov-sunk">
                  <th scope="row" className="px-4 py-3 text-left font-medium">
                    <Link href={`/result/${r.id}`} className="text-gov-ink hover:text-gov-link">
                      {r.cropName} · {fmtPyeong(r.pyeong)}
                    </Link>
                  </th>
                  <td className="px-4 py-3 text-[13px] text-gov-ink2">{r.productName}</td>
                  <td className="tabular px-4 py-3 text-gov-ink2">{won(r.riskLimit)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={r.crisisProb > 0.1 ? "danger" : r.crisisProb > 0.05 ? "warn" : "ok"}>
                      {pct(r.crisisProb)}
                    </Badge>
                  </td>
                  <td className="tabular px-4 py-3 text-[13px] text-gov-ink3">
                    {new Date(r.savedAt).toLocaleDateString("ko-KR")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => { removeReport(r.id); setRows(loadReports()); }}
                            className="text-[12px] text-gov-ink3 underline underline-offset-2 hover:text-gov-point">
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6">
        <Notice tone="info" title="기록은 이 브라우저에만 남아요">
          최근 12건까지 보관해요. 브라우저 데이터를 지우면 목록도 사라지지만, 리포트
          링크를 갖고 있으면 언제든 다시 열 수 있어요.
        </Notice>
      </div>
    </>
  );
}
