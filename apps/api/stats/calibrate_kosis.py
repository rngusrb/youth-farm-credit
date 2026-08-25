"""KOSIS 농산물소득조사 → 작목별 σ · 요인분해를 실측해 crops.json 에 기록한다.

    python -m stats.calibrate_kosis
    python -m stats.calibrate_kosis --dry-run
    python -m stats.calibrate_kosis --no-pool     # 계층 축소 없이 원추정치

세 가지를 한 번에 한다.

1. **σ 실측** — 작목별 연도 소득 시계열의 로그수익률 표준편차.
2. **계층 축소** — 관측 11년으로 잰 σ 에는 표본오차가 크게 섞여 있다. 작목 전체의
   σ 분포를 추정해 그쪽으로 당긴다(stats/hierarchical). 계열이 2년뿐인 수경 작목은
   같은 품목의 관행 계열(이미 축소된 값)을 기준점으로 삼고 레버리지 비율만 곱한다.
3. **요인분해** — 소득 변동을 가격·수량·비용으로 쪼갠다(stats/factors). 부수적으로
   가격-수량 탄력성이 실측돼, KAMIS 환산에 쓰던 가정값(−0.5)을 대체한다.

**σ 를 통째로 교체하지는 않는다.** 공표값은 전국 평균이라 농가별 특이 충격이 이미
상쇄돼 있다. 여기서 재는 것은 공통 성분이고, 최종 σ 는 σ_고유(policy.json 의 가정값)
와 제곱합으로 합친다.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass

import numpy as np

from engine.params import DATA_DIR, crops
from stats.env import load as load_env
from stats.factors import FactorProfile, decompose_all, median_elasticity
from stats.hierarchical import CropObservation, Population, PooledSigma, pool_all
from stats.kosis import KosisError, fetch_group, series_for
from stats.leverage import degree_of_operating_leverage
from stats.volatility import bootstrap_ci, log_returns

CROPS_PATH = DATA_DIR / "crops.json"
POLICY_PATH = DATA_DIR / "policy.json"
MIN_YEARS_OWN = 5


@dataclass
class Result:
    crop_id: str
    kosis_name: str
    series_name: str
    years: tuple[int, int] | None
    n: int
    sigma_raw: float | None
    sigma_pooled: float
    weight_own: float
    dol_ratio: float
    dol_years: tuple[int, ...]
    sigma_common: float
    ci: tuple[float, float] | None
    factors: FactorProfile | None


def _dol_by_year(rows, crop_name: str) -> dict[int, float]:
    gross = dict(series_for(rows, crop_name, "gross"))
    cost = dict(series_for(rows, crop_name, "cost"))
    out: dict[int, float] = {}
    for year in sorted(set(gross) & set(cost)):
        try:
            out[year] = degree_of_operating_leverage(gross[year], cost[year]).dol
        except ValueError:
            continue
    return out


def _dol_ratio(rows, target: str, base: str) -> tuple[float, tuple[int, ...]]:
    """두 계열의 레버리지 비율. **반드시 겹치는 연도끼리** 비교한다.

    다른 해의 DOL 을 나누면 그 해의 작황·시세가 재배방식 차이로 둔갑한다.
    """
    a, b = _dol_by_year(rows, target), _dol_by_year(rows, base)
    shared = sorted(set(a) & set(b))
    if not shared:
        return 1.0, ()
    return float(np.mean([a[y] / b[y] for y in shared])), tuple(shared)


def collect_observations(rows) -> list[CropObservation]:
    """계층 모델에 넣을 작목별 σ 원추정치."""
    out: list[CropObservation] = []
    for crop in sorted({r.crop_name for r in rows if r.crop_name}):
        series = series_for(rows, crop, "income")
        values = np.array([v for _, v in series], dtype=float)
        if len(values) < 3 or (values <= 0).any():
            out.append(CropObservation(crop, 0.0, max(len(values) - 1, 0)))
            continue
        returns = log_returns(values)
        out.append(CropObservation(crop, float(np.std(returns, ddof=1)), returns.size))
    return out


def calibrate(rows, use_pooling: bool = True) -> tuple[Population, list[Result], dict[str, FactorProfile]]:
    population, pooled = pool_all(collect_observations(rows))
    profiles = decompose_all(rows)

    results: list[Result] = []
    for crop in crops().values():
        mapping = crop.kosis
        if not mapping:
            continue
        anchor_name = mapping["series_name"]
        anchor: PooledSigma | None = pooled.get(anchor_name)
        if anchor is None:
            print(f"건너뜀 {crop.id}: '{anchor_name}' 계열 없음", file=sys.stderr)
            continue

        series = series_for(rows, anchor_name, "income")
        if len(series) < MIN_YEARS_OWN:
            print(f"건너뜀 {crop.id}: '{anchor_name}' {len(series)}개년", file=sys.stderr)
            continue

        values = np.array([v for _, v in series], dtype=float)
        returns = log_returns(values)
        lo, hi = bootstrap_ci(returns, periods_per_year=1)

        base = mapping.get("ratio_base", anchor_name)
        ratio, shared = (1.0, ())
        if mapping["name"] != base:
            ratio, shared = _dol_ratio(rows, mapping["name"], base)

        sigma_pick = anchor.sigma if use_pooling else anchor.sigma_raw
        # 축소로 σ 가 움직인 만큼 구간도 같이 옮긴다.
        scale = sigma_pick / anchor.sigma_raw if anchor.sigma_raw > 0 else 1.0

        results.append(Result(
            crop_id=crop.id,
            kosis_name=mapping["name"],
            series_name=anchor_name,
            years=(series[0][0], series[-1][0]),
            n=len(series),
            sigma_raw=anchor.sigma_raw,
            sigma_pooled=anchor.sigma,
            weight_own=anchor.weight_own,
            dol_ratio=ratio,
            dol_years=shared,
            sigma_common=sigma_pick * ratio,
            ci=(lo * scale * ratio, hi * scale * ratio),
            factors=profiles.get(mapping["name"]) or profiles.get(anchor_name),
        ))
    return population, results, profiles


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="KOSIS 소득조사로 σ·요인 실측")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-pool", action="store_true", help="계층 축소 없이 원추정치 사용")
    args = ap.parse_args(argv)
    load_env()

    groups = sorted({c.kosis["group"] for c in crops().values() if c.kosis})
    rows = []
    for g in groups:
        print(f"수집  {g} …", file=sys.stderr)
        rows += fetch_group(g)
    print(f"      {len(rows):,}행\n", file=sys.stderr)

    population, results, profiles = calibrate(rows, use_pooling=not args.no_pool)

    print(f"작목 전체 분포 — 대표 σ {population.typical_sigma:.3f} · "
          f"작목간 산포 {population.tau:.3f} · {population.n_crops}작목", file=sys.stderr)
    signal = population.tau ** 2 / (population.tau ** 2 + 1 / (2 * 10))
    print(f"관측 11년 기준, 작목 차이 중 실제 신호 비중 {signal:.0%}\n", file=sys.stderr)

    head = (f"{'작목':<18}{'계열':<16}{'n':>3}{'σ원값':>8}{'축소후':>8}"
            f"{'가중':>6}{'이전':>6}{'σ공통':>8}  {'주원인':>9}")
    print(head, file=sys.stderr)
    print("─" * 96, file=sys.stderr)
    for r in results:
        driver = r.factors.driver if r.factors else "-"
        print(f"{r.crop_id:<18}{r.series_name:<16}{r.n:>3}{r.sigma_raw:>8.3f}"
              f"{r.sigma_pooled:>8.3f}{r.weight_own:>6.0%}{r.dol_ratio:>6.2f}"
              f"{r.sigma_common:>8.3f}  {driver:>9}", file=sys.stderr)

    elasticity = median_elasticity(profiles)
    print(f"\n가격-수량 탄력성 중앙값 {elasticity:.3f}  ({len(profiles)}작목 실측)",
          file=sys.stderr)

    if args.dry_run:
        print("\n--dry-run: 파일을 수정하지 않았습니다.", file=sys.stderr)
        return 0

    data = json.loads(CROPS_PATH.read_text(encoding="utf-8"))
    by_id = {c["id"]: c for c in data["crops"]}
    policy = json.loads(POLICY_PATH.read_text(encoding="utf-8"))
    idio = float(policy["sigma_decomposition"]["idiosyncratic_sigma"])

    for r in results:
        c = by_id[r.crop_id]
        before = c.get("sigma")
        total = math.hypot(r.sigma_common, idio)
        c["sigma_common"] = round(r.sigma_common, 4)
        c["sigma"] = round(total, 4)
        c["sigma_source"] = "MEASURED"
        c["sigma_ci"] = [round(math.hypot(r.ci[0], idio), 4),
                         round(math.hypot(r.ci[1], idio), 4)]
        c["sigma_method"] = "kosis_pooled_income_series_plus_assumed_idiosyncratic"
        c["sigma_n"] = r.n
        c["sigma_reference"] = (
            f"KOSIS 농산물소득조사(농촌진흥청) '{r.series_name}' "
            f"{r.years[0]}~{r.years[1]} {r.n}개년 σ={r.sigma_raw:.3f} → "
            f"{population.n_crops}작목 분포로 축소 {r.sigma_pooled:.3f}"
            + (f" → '{r.kosis_name}' 레버리지 {r.dol_ratio:.2f}배 이전"
               f"({'/'.join(map(str, r.dol_years))} 동일연도)" if r.dol_ratio != 1.0 else "")
            + f", 농가 고유 σ={idio} 가정 합성"
        )
        if r.factors:
            c["factors"] = r.factors.as_crop_fields()
        print(f"  {r.crop_id:<18} σ {before} → {c['sigma']}", file=sys.stderr)

    policy["sigma_decomposition"]["crop_population_sigma"] = round(population.typical_sigma, 4)
    policy["sigma_decomposition"]["crop_population_tau"] = round(population.tau, 4)
    policy["price_quantity_elasticity"] = {
        "median": round(elasticity, 4),
        "source": "MEASURED",
        "note": (
            f"KOSIS 농산물소득조사 {len(profiles)}작목의 가격-수량 회귀 기울기 중앙값. "
            "KAMIS 가격 σ 를 소득 σ 로 환산할 때 쓰던 가정값(-0.5)을 대체한다."
        ),
    }
    POLICY_PATH.write_text(json.dumps(policy, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    CROPS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\n{CROPS_PATH.name} / {POLICY_PATH.name} 갱신 완료", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
