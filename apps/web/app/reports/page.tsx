"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/shell/PageHeader";
import Disclaimer from "@/components/shell/Disclaimer";
import { Card, Empty, Page, Pill } from "@/components/ui";
import { loadReports, removeReport, type SavedReport } from "@/lib/profile";
import { pct, pyeong as fmtPyeong, won } from "@/lib/format";

export default function ReportsPage() {
  const [rows, setRows] = useState<SavedReport[]>([]);
  useEffect(() => setRows(loadReports()), []);

  return (
    <Page>
      <PageHeader
        title="내 리포트"
        lead="진단 결과는 서버에 저장되지 않습니다. 문서번호(URL)에 입력값이 통째로 들어 있어서 링크만 있으면 언제든 같은 리포트가 다시 계산됩니다. 이 목록은 이 브라우저의 기록입니다."
      />

      {rows.length === 0 ? (
        <Empty
          title="아직 저장된 리포트가 없습니다"
          body="진단을 한 번 실행하면 여기에 남습니다. 링크를 복사해 두면 다른 기기에서도 같은 리포트를 열 수 있습니다."
          cta={{ href: "/diagnose", label: "진단 시작하기" }}
        />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-ink-800">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-4 px-5 py-4">
                <Link href={`/result/${r.id}`} className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <span className="font-medium">{r.cropName}</span>
                    <span className="text-sm text-slate-500">{fmtPyeong(r.pyeong)}</span>
                    <span className="text-xs text-slate-600">{r.productName}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="tabular">감당 가능 {won(r.riskLimit)}</span>
                    <Pill tone={r.crisisProb > 0.1 ? "danger" : r.crisisProb > 0.05 ? "warn" : "ok"}>
                      2년연속 위기 {pct(r.crisisProb)}
                    </Pill>
                    <span className="text-slate-600">
                      {new Date(r.savedAt).toLocaleDateString("ko-KR")}
                    </span>
                  </div>
                </Link>
                <button
                  onClick={() => {
                    removeReport(r.id);
                    setRows(loadReports());
                  }}
                  className="shrink-0 text-xs text-slate-600 transition hover:text-signal-danger"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Disclaimer />
    </Page>
  );
}
