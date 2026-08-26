"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/shell/PageHeader";
import Disclaimer from "@/components/shell/Disclaimer";
import RiskTriad from "@/components/dashboard/RiskTriad";
import { Card, CardTitle, Empty, Page, Pill, Stat } from "@/components/ui";
import { fetchCrop, fetchCrops, runDiagnose, type CropDetail, type Diagnosis } from "@/lib/api";
import { headlineLimit, unsafeGap } from "@/lib/diagnosis";
import { loadProfile, loadReports, type FarmProfile, type SavedReport } from "@/lib/profile";
import { pyeong as fmtPyeong, won } from "@/lib/format";

const REGIME_LABEL: Record<string, string> = {
  calm: "평소보다 조용함",
  normal: "평상 수준",
  turbulent: "평소보다 요동침",
};

export default function DashboardPage() {
  const [profile, setProfile] = useState<FarmProfile | null>(null);
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [crop, setCrop] = useState<CropDetail | null>(null);
  const [cropCount, setCropCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setProfile(loadProfile());
    setReports(loadReports());
    fetchCrops()
      .then((d) => setCropCount(d.crops.length))
      .catch(() => setError("백엔드에 연결하지 못했습니다. apps/api 가 실행 중인지 확인해 주세요."));
  }, []);

  // 농가 정보가 있으면 대시보드를 열 때마다 최신 기준으로 다시 계산한다.
  // 서버에 저장된 결과를 읽는 게 아니라 매번 엔진을 돌리므로 데이터가 바뀌면 바로 반영된다.
  useEffect(() => {
    if (!profile) {
      setLoading(false);
      return;
    }
    let alive = true;
    Promise.all([
      runDiagnose({
        crop_id: profile.cropId,
        pyeong: profile.pyeong,
        living_cost: profile.livingCost,
        other_debt_service: profile.otherDebtService,
        product_id: profile.productId,
        income_history: profile.incomeHistory,
      }),
      fetchCrop(profile.cropId),
    ])
      .then(([d, c]) => {
        if (!alive) return;
        setDiag(d);
        setCrop(c);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "계산에 실패했습니다."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [profile]);

  return (
    <Page>
      <PageHeader
        title="대시보드"
        lead="농가 정보를 한 번 넣어 두면 여기서 상환 위험·시장 국면·제도 요건을 함께 봅니다."
        aside={
          <Link
            href="/diagnose"
            className="rounded-lg bg-signal-warn px-4 py-2 text-sm font-semibold text-ink-950 transition hover:brightness-110"
          >
            새 진단
          </Link>
        }
      />

      {error && (
        <div className="mb-6 rounded-lg border border-signal-danger/40 bg-signal-danger/10 px-4 py-3 text-sm text-signal-danger">
          {error}
        </div>
      )}

      {!profile && !loading && (
        <Empty
          title="아직 농가 정보가 없습니다"
          body="작목과 면적, 생활비만 넣으면 감당할 수 있는 차입 규모와 몇 년차에 무리가 오는지를 계산합니다. 로그인은 없고 이 브라우저에만 저장됩니다."
          cta={{ href: "/farm", label: "내 농가 설정하기" }}
        />
      )}

      {profile && (
        <div className="grid gap-5 lg:grid-cols-3">
          {/* ── 주 기능: 상환 위험 ─────────────────────────── */}
          <Card className="lg:col-span-2">
            <CardTitle href={diag ? `/result/${diag.diagnosis_id}` : undefined} action="리포트 보기">
              상환 위험
            </CardTitle>
            {loading && <p className="text-sm text-slate-500">계산 중…</p>}
            {diag && (
              <>
                <div className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-3">
                  <Stat
                    label="감당 가능한 차입"
                    value={won(headlineLimit(diag))}
                    tone={unsafeGap(diag) > 0 ? "warn" : "ok"}
                    note={
                      unsafeGap(diag) > 0
                        ? `제도상 ${won(diag.limits.available)} 까지 신청 가능하지만 ${won(unsafeGap(diag))} 는 갚기 어려운 구간입니다`
                        : "제도 한도까지 감당 가능합니다"
                    }
                  />
                  <div className="ml-auto text-right">
                    <div className="text-[11px] text-slate-500">
                      {diag.input.crop_name} · {fmtPyeong(diag.input.pyeong)}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">{diag.product.name}</div>
                  </div>
                </div>
                <RiskTriad d={diag} />
                {diag.limits.binding_constraint === "livelihood" && (
                  <p className="mt-3 rounded-lg border border-signal-danger/30 bg-signal-danger/5 px-3 py-2 text-xs leading-relaxed text-signal-danger">
                    빌리는 금액이 문제가 아니라 <b>경영 규모가 작습니다</b>. 대출을 0으로 해도
                    생활비를 감당하기 어려운 상태라, 한도를 낮추는 것으로는 풀리지 않습니다.
                  </p>
                )}
              </>
            )}
          </Card>

          {/* ── 내 농가 ────────────────────────────────── */}
          <Card>
            <CardTitle href="/farm" action="수정">
              내 농가
            </CardTitle>
            {diag && (
              <dl className="space-y-2.5 text-sm">
                {[
                  ["작목", diag.input.crop_name],
                  ["재배 면적", fmtPyeong(diag.input.pyeong)],
                  ["연 농업소득", won(diag.income.annual)],
                  ["생활비", won(diag.input.living_cost)],
                  ["상환 가용액", won(diag.income.capacity)],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-3">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="tabular font-medium">{v}</dd>
                  </div>
                ))}
                <div className="flex items-baseline justify-between gap-3 border-t border-ink-800 pt-2.5">
                  <dt className="text-slate-500">소득 변동성 σ</dt>
                  <dd className="flex items-center gap-2">
                    <span className="tabular font-medium">{diag.sigma.toFixed(3)}</span>
                    <Pill tone={diag.sigma_personalized ? "info" : "plain"}>
                      {diag.sigma_personalized ? "내 이력 반영" : "작목 평균"}
                    </Pill>
                  </dd>
                </div>
              </dl>
            )}
          </Card>

          {/* ── 시장 국면 ──────────────────────────────── */}
          <Card>
            <CardTitle href="/market" action="자세히">
              시장 국면
            </CardTitle>
            {crop?.market?.garch ? (
              <>
                <Stat
                  label={crop.name}
                  value={REGIME_LABEL[crop.market.garch.regime] ?? crop.market.garch.regime}
                  tone={
                    crop.market.garch.regime === "turbulent"
                      ? "warn"
                      : crop.market.garch.regime === "calm"
                        ? "ok"
                        : "plain"
                  }
                  note={`현재 변동성이 장기 평균의 ${crop.market.garch.current_over_longrun.toFixed(2)}배 · KAMIS 도매가 ${crop.market.trading_days.toLocaleString("ko-KR")}거래일`}
                />
                <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
                  시장 국면은 한도 계산에 반영하지 않습니다. 25년 상환에 본질적인 것은 장기
                  평균이고, 조용한 시기라고 더 빌려도 된다는 뜻은 아니기 때문입니다.
                </p>
              </>
            ) : (
              <p className="text-xs leading-relaxed text-slate-500">
                {crop?.name ?? "이 작목"}은 KAMIS 도매가 시계열을 아직 수집하지 않았습니다.
                σ 는 KOSIS 소득조사 실측값을 씁니다.
              </p>
            )}
          </Card>

          {/* ── 제도 근거 ──────────────────────────────── */}
          <Card>
            <CardTitle href="/policy" action="검색">
              제도 근거
            </CardTitle>
            <p className="mb-3 text-xs leading-relaxed text-slate-500">
              2026년 시행지침 3종 원문에서 근거 조항을 찾습니다. 조항을 못 찾으면 답을
              만들어내지 않습니다.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {["거치기간", "재해 상환연기", "연령 요건", "융자 한도"].map((q) => (
                <Link
                  key={q}
                  href={`/policy?q=${encodeURIComponent(q)}`}
                  className="rounded-full border border-ink-700 px-2.5 py-1 text-[11px] text-slate-400 transition hover:border-ink-600 hover:text-slate-200"
                >
                  {q}
                </Link>
              ))}
            </div>
          </Card>

          {/* ── 데이터 현황 ────────────────────────────── */}
          <Card>
            <CardTitle href="/crops" action="전체">
              데이터 현황
            </CardTitle>
            <div className="grid grid-cols-2 gap-4">
              <Stat label="작목" value={cropCount?.toString() ?? "—"} unit="종" />
              <Stat label="지침 원문" value="3" unit="종" />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
              소득 변동성은 KOSIS 농산물소득조사에서 작목별로 실측합니다. 농가 고유 변동만
              가정값이며, 소득 이력을 넣으면 그것도 실측으로 바뀝니다.
            </p>
          </Card>

          {/* ── 최근 리포트 ────────────────────────────── */}
          <Card className="lg:col-span-3">
            <CardTitle href="/reports" action="전체">
              최근 리포트
            </CardTitle>
            {reports.length === 0 ? (
              <p className="text-xs text-slate-500">
                아직 저장된 리포트가 없습니다. 진단을 실행하면 이 브라우저에 남습니다.
              </p>
            ) : (
              <ul className="divide-y divide-ink-800">
                {reports.slice(0, 4).map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/result/${r.id}`}
                      className="flex items-center justify-between gap-4 py-2.5 text-sm transition hover:text-slate-100"
                    >
                      <span className="min-w-0 truncate">
                        {r.cropName} · {fmtPyeong(r.pyeong)}
                        <span className="ml-2 text-xs text-slate-500">{r.productName}</span>
                      </span>
                      <span className="tabular shrink-0 text-slate-400">{won(r.riskLimit)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      <Disclaimer />
    </Page>
  );
}
