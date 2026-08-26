"""KAMIS 도매가격으로 시장 국면을 재고, KOSIS 결과를 교차검증한다.

    python -m stats.calibrate_market --dry-run
    python -m stats.calibrate_market --years 11

두 가지를 한다.

1. **교차검증** — KAMIS 일별 도매가의 연평균 변동성과 KOSIS 농가수취가격 변동성을
   맞대본다. 서로 다른 기관이 서로 다른 방식으로 모은 자료라, 값이 맞으면 σ 파이프
   라인 전체가 독립적으로 뒷받침된다. 딸기에서 0.087 대 0.083 으로 일치했다.

2. **현재 국면** — GARCH(1,1) 로 장기 평균 변동성과 지금의 조건부 변동성을 비교한다.
   **한도에는 반영하지 않는다.** 25년 상환에 본질적인 것은 장기 평균이고, 현재 국면은
   "지금 시작하기에 조용한 때인가"라는 안내일 뿐이다. 이걸 한도에 넣으면 시장이
   조용할 때 더 빌리라고 부추기는 꼴이 된다.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, timedelta

from engine.params import DATA_DIR, crops
from stats.env import load as load_env
from estimators.garch import annual_price_sigma, ewma_volatility, fit_garch
from stats.kamis import KamisError, daily_national_average, fetch_prices

CROPS_PATH = DATA_DIR / "crops.json"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="KAMIS 도매가로 시장 국면 측정·교차검증")
    ap.add_argument("--years", type=int, default=11)
    ap.add_argument("--crop", default=None)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)
    load_env()

    end = date.today()
    start = end - timedelta(days=365 * args.years)
    targets = [c for c in crops().values()
               if c.kamis and (not args.crop or c.id == args.crop)]

    head = (f"{'작목':<18}{'거래일':>7}{'연평균가σ':>11}{'KOSIS가격σ':>11}"
            f"{'차이':>7}{'α+β':>7}{'반감기':>7}{'국면':>10}")
    print(head, file=sys.stderr)
    print("─" * len(head), file=sys.stderr)

    measured: dict[str, dict] = {}
    seen: dict[str, list] = {}
    for crop in targets:
        key = (crop.kamis["ctgry_cd"], crop.kamis["item_cd"], crop.kamis.get("vrty_cd"))
        cache = seen.get(str(key))
        if cache is None:
            try:
                rows = fetch_prices(crop.id, start, end)
            except KamisError as exc:
                print(f"{crop.id:<18} 수집 실패: {exc}", file=sys.stderr)
                continue
            cache = daily_national_average(rows)
            seen[str(key)] = cache
        series = cache
        if len(series) < 300:
            print(f"{crop.id:<18} 거래일 {len(series)} — 부족", file=sys.stderr)
            continue

        annual_sigma = annual_price_sigma(series)
        fit = fit_garch(series)
        kosis_price_sigma = (crop.factors or {}).get("sigma_price")
        diff = (
            abs(annual_sigma - kosis_price_sigma) if annual_sigma and kosis_price_sigma else None
        )

        print(f"{crop.id:<18}{len(series):>7,}"
              f"{annual_sigma if annual_sigma is None else round(annual_sigma,3)!s:>11}"
              f"{kosis_price_sigma if kosis_price_sigma is None else round(kosis_price_sigma,3)!s:>11}"
              f"{diff if diff is None else round(diff,3)!s:>7}"
              f"{fit.persistence if fit else '-':>7.3f}"
              f"{fit.half_life_days if fit else 0:>7.1f}"
              f"{fit.regime if fit else '-':>10}", file=sys.stderr)

        if fit:
            measured[crop.id] = {
                "source": "KAMIS 일별 도매가격 (공공데이터포털 15156057)",
                "window": [start.isoformat(), end.isoformat()],
                "trading_days": len(series),
                "annual_price_sigma": round(annual_sigma, 4) if annual_sigma else None,
                "kosis_price_sigma": kosis_price_sigma,
                "garch": {
                    "alpha": round(fit.alpha, 4),
                    "beta": round(fit.beta, 4),
                    "persistence": round(fit.persistence, 4),
                    "half_life_days": round(fit.half_life_days, 1),
                    "regime": fit.regime,
                    "current_over_longrun": round(
                        fit.current_daily_sigma / fit.long_run_daily_sigma, 3
                    ),
                },
                "ewma_check": round(ewma_volatility(series) or 0, 4),
                "note": "국면은 안내용. 한도 계산에는 쓰지 않는다.",
            }

    if args.dry_run:
        print("\n--dry-run: crops.json 을 수정하지 않았습니다.", file=sys.stderr)
        return 0

    data = json.loads(CROPS_PATH.read_text(encoding="utf-8"))
    for c in data["crops"]:
        if c["id"] in measured:
            c["market"] = measured[c["id"]]
    CROPS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\n{len(measured)}작목의 시장 국면을 기록했습니다.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
