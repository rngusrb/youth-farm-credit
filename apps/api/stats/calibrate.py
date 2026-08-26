"""σ 캘리브레이션 CLI — 시계열을 읽어 crops.json 의 sigma 를 실측값으로 교체한다.

    # KOSIS 농산물소득조사 — 재배방식별 소득 시계열. 환산 가정이 없어 가장 깨끗하다.
    python -m stats.calibrate --crop strawberry_hydro --kosis

    # KAMIS 도매가격을 직접 받아 추정 (DATA_GO_KR_SERVICE_KEY 필요)
    python -m stats.calibrate --crop strawberry_hydro --kamis --years 10

    # 연간 소득 시계열 (권장)
    python -m stats.calibrate --crop strawberry_hydro --csv income.csv \
        --column income --kind annual-income --source "농진청 소득조사 패널"

    # 일별 도매가격 시계열
    python -m stats.calibrate --crop strawberry_hydro --csv kamis.csv \
        --column price --kind daily-price --seasonal 250 \
        --source "KAMIS 도매가격 2015-2025"

    # 먼저 확인만 (파일 수정 안 함)
    python -m stats.calibrate ... --dry-run

CSV 는 헤더가 있는 일반 CSV 면 된다. KAMIS Open API 를 붙이려면 발급받은 키로
받아온 응답을 CSV 로 떨궈 이 CLI 에 넘기는 게 가장 단순하다.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

import numpy as np

from engine.params import DATA_DIR
from stats.env import load as load_env
from estimators.volatility import (
    DEFAULT_COST_LEVERAGE,
    DEFAULT_QUANTITY_ELASTICITY,
    MONTHS_PER_YEAR,
    TRADING_DAYS_PER_YEAR,
    estimate_from_annual_series,
    estimate_from_price_series,
)

CROPS_PATH = DATA_DIR / "crops.json"

PERIODS = {
    "daily-price": TRADING_DAYS_PER_YEAR,
    "monthly-price": MONTHS_PER_YEAR,
    "annual-income": 1,
}


def read_column(path: Path, column: str) -> np.ndarray:
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None or column not in reader.fieldnames:
            raise SystemExit(
                f"'{column}' 열이 없습니다. 사용 가능한 열: {reader.fieldnames}"
            )
        values = []
        for row in reader:
            raw = (row[column] or "").replace(",", "").strip()
            if not raw:
                continue
            try:
                values.append(float(raw))
            except ValueError:
                continue
    if len(values) < 3:
        raise SystemExit(f"유효한 숫자가 {len(values)}개뿐입니다. 최소 3개 필요합니다.")
    return np.array(values)


def load_from_kamis(crop_id: str, years: int, market: str | None) -> tuple[np.ndarray, str, int]:
    """KAMIS 일별 도매가격을 받아 날짜별 전국 평균 시계열로 접는다."""
    from stats.kamis import daily_national_average, default_window, fetch_prices

    start, end = default_window(years)
    rows = fetch_prices(crop_id, start, end, market_code=market)
    if not rows:
        raise SystemExit("조회 결과가 비었습니다. 기간·품목코드를 확인하세요.")
    series = daily_national_average(rows)
    source = (
        f"KAMIS 일별 도매가격 (공공데이터포털 15156057) "
        f"{start:%Y-%m-%d}~{end:%Y-%m-%d}, 관측 {len(rows):,}건"
    )
    print(f"수신      {len(rows):,}행 → 거래일 {len(series)}일", file=sys.stderr)
    return np.array([v for _, v in series]), source, len(series)


def load_from_kosis(crop_id: str, group: str) -> tuple[np.ndarray, str]:
    """KOSIS 농산물소득조사에서 재배방식별 연도 소득 시계열을 받아온다."""
    from engine.params import get_crop
    from stats.kosis import available_crops, fetch_group, series_for

    crop = get_crop(crop_id)
    rows = fetch_group(group)
    series = series_for(rows, crop.name, "income")
    if not series:
        raise SystemExit(
            f"'{crop.name}' 을(를) 찾지 못했습니다.\n"
            f"수집된 작목명: {', '.join(available_crops(rows)[:40])}"
        )
    years = [y for y, _ in series]
    print(f"수신      {crop.name} {years[0]}~{years[-1]} {len(series)}개년", file=sys.stderr)

    # 조수입·경영비가 함께 잡히면 영업레버리지를 계산해 보여준다.
    gross = dict(series_for(rows, crop.name, "gross"))
    cost = dict(series_for(rows, crop.name, "cost"))
    last = years[-1]
    if gross.get(last) and cost.get(last):
        from estimators.leverage import degree_of_operating_leverage

        lev = degree_of_operating_leverage(gross[last], cost[last])
        print(f"레버리지  DOL {lev.dol:.2f} (조수입 {gross[last]:,.0f} / 경영비 {cost[last]:,.0f}, {last})",
              file=sys.stderr)

    source = f"KOSIS 농산물소득조사 (농촌진흥청) {years[0]}~{years[-1]}, 전국 평균"
    return np.array([v for _, v in series]), source


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="시계열로 작목 σ 를 실측값으로 교체")
    ap.add_argument("--crop", required=True, help="crops.json 의 작목 id")
    ap.add_argument("--kamis", action="store_true", help="KAMIS 가격 API 에서 수집")
    ap.add_argument("--kosis", action="store_true", help="KOSIS 농산물소득조사에서 수집")
    ap.add_argument("--group", default="시설채소", help="--kosis 작목군 (시설채소/화훼/과수/노지채소/식량특용)")
    ap.add_argument("--years", type=int, default=10, help="--kamis 수집 기간(년)")
    ap.add_argument("--market", default=None, help="시장코드로 한정 (예: 0110211 가락도매)")
    ap.add_argument("--csv", type=Path)
    ap.add_argument("--column", help="값이 든 열 이름")
    ap.add_argument("--kind", choices=sorted(PERIODS))
    ap.add_argument("--source", help="출처 문자열. 결과에 기록된다")
    ap.add_argument("--seasonal", type=int, default=None, help="계절조정 주기(관측 수)")
    ap.add_argument("--elasticity", type=float, default=DEFAULT_QUANTITY_ELASTICITY)
    ap.add_argument("--cost-leverage", type=float, default=DEFAULT_COST_LEVERAGE)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)
    load_env()

    if args.kosis:
        series, source = load_from_kosis(args.crop, args.group)
        kind, periods, seasonal = "annual-income", 1, None
    elif args.kamis:
        series, source, n_days = load_from_kamis(args.crop, args.years, args.market)
        kind = "daily-price"
        # 거래일 기준 연율화. 관측일 수가 곧 연간 거래일 추정치다.
        periods = max(1, round(n_days / max(args.years, 1)))
        seasonal = args.seasonal if args.seasonal is not None else periods
    else:
        missing = [f"--{k}" for k in ("csv", "column", "kind", "source")
                   if getattr(args, k) is None]
        if missing:
            ap.error(f"--kosis/--kamis 를 쓰지 않으면 {', '.join(missing)} 이(가) 필요합니다")
        series = read_column(args.csv, args.column)
        kind, source = args.kind, args.source
        periods, seasonal = PERIODS[args.kind], args.seasonal

    args.kind, args.source = kind, source

    if args.kind == "annual-income":
        est = estimate_from_annual_series(series, args.source)
    else:
        est = estimate_from_price_series(
            series,
            periods_per_year=periods,
            seasonal_period=seasonal,
            quantity_elasticity=args.elasticity,
            cost_leverage=args.cost_leverage,
            source=args.source,
        )

    print(f"작목      {args.crop}", file=sys.stderr)
    print(f"관측치    {est.n_observations}", file=sys.stderr)
    print(f"방법      {est.method}", file=sys.stderr)
    print(f"σ         {est.sigma:.4f}  95% CI [{est.ci_low:.4f}, {est.ci_high:.4f}]",
          file=sys.stderr)
    if est.assumptions:
        print(f"환산가정  {est.assumptions}", file=sys.stderr)

    if est.n_observations < 10:
        print("\n⚠ 관측치가 10개 미만입니다. 신뢰구간을 반드시 함께 보고하세요.",
              file=sys.stderr)
    if args.kosis:
        print("\n⚠ 공표값은 전국 평균이라 농가별 특이 충격이 상쇄돼 있습니다.",
              file=sys.stderr)
        print("  여기서 잰 σ 는 개별 농가가 겪는 변동의 하한으로 보아야 합니다.",
              file=sys.stderr)

    data = json.loads(CROPS_PATH.read_text(encoding="utf-8"))
    target = next((c for c in data["crops"] if c["id"] == args.crop), None)
    if target is None:
        raise SystemExit(f"crops.json 에 '{args.crop}' 가 없습니다")

    before = target.get("sigma"), target.get("sigma_source")
    target.update(est.as_crop_fields())
    print(f"\n{before[1]} {before[0]} → MEASURED {target['sigma']}", file=sys.stderr)

    if args.dry_run:
        print("--dry-run: crops.json 을 수정하지 않았습니다.", file=sys.stderr)
        return 0

    CROPS_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"{CROPS_PATH} 를 갱신했습니다. '변동성 가정값' 배지가 사라집니다.",
          file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
