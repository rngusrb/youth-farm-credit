"""월별 현금흐름에 필요한 값을 KOSIS 에서 채운다 (adapters, 1회성 CLI).

지금까지 crops.json 은 **소득**(총수입−경영비)만 들고 있었다. 소득만으로는
월별 현금흐름을 그릴 수 없다 — 돈이 들어오는 시점(수확기 총수입)과 나가는
시점(연중 경영비)이 다르기 때문이다. 이 차이가 곧 운전자금 부족이다.

    python -m stats.calibrate_cashflow --dry-run
    python -m stats.calibrate_cashflow --write
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from engine.params import crops
from stats import env
from stats.kosis import fetch_group, series_for

DATA = Path(__file__).resolve().parent.parent / "data" / "crops.json"


def pick_year(series: list[tuple[int, float]], want: int | None) -> tuple[int, float] | None:
    """income_year 와 같은 해를 쓴다. 없으면 가장 최근 해."""
    if not series:
        return None
    if want:
        for y, v in series:
            if y == want:
                return y, v
    return max(series, key=lambda t: t[0])


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="총수입·경영비 수집")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)
    if not (args.write or args.dry_run):
        ap.error("--write 또는 --dry-run 중 하나를 골라라")

    env.load()
    raw = json.loads(DATA.read_text(encoding="utf-8"))
    by_id = {c["id"]: c for c in raw["crops"]}

    groups = sorted({c.kosis["group"] for c in crops().values() if c.kosis})
    cache: dict[str, list] = {}
    for g in groups:
        cache[g] = fetch_group(g, 2015, 2100)
        print(f"  {g}: {len(cache[g])}행", file=sys.stderr)

    filled = missing = 0
    for crop in crops().values():
        rec = by_id[crop.id]
        m = crop.kosis or {}
        # σ 를 이전받은 작목은 자기 계열이 짧다. 총수입·경영비도 같은 기준 계열에서 읽는다.
        name = m.get("series_name") or m.get("name")
        rows = cache.get(m.get("group", ""), [])
        try:
            gross = pick_year(series_for(rows, name, "gross"), rec.get("income_year"))
            cost = pick_year(series_for(rows, name, "cost"), rec.get("income_year"))
        except Exception as e:
            print(f"  ❌ {crop.id}: {e}", file=sys.stderr)
            missing += 1
            continue
        if not gross or not cost:
            print(f"  ❌ {crop.id}: 총수입/경영비 계열 없음", file=sys.stderr)
            missing += 1
            continue

        # 소득 = 총수입 − 경영비 가 성립해야 한다. 그런데 σ 를 다른 계열에서
        # 이전받은 작목(예: 수경 딸기)은 income 과 gross/cost 의 출처 계열이 달라
        # 항등식이 깨진다. 실측 **비용률**은 살리고 규모만 자기 소득에 맞춘다.
        #     cost_ratio = 경영비/총수입           (기준 계열에서 실측)
        #     gross' = income / (1 − cost_ratio),  cost' = gross' × cost_ratio
        g, c = gross[1], cost[1]
        income = rec["income_per_10a"]
        implied = g - c
        ratio = implied / income if income else 0
        cost_ratio = c / g if g else 0
        rescaled = abs(ratio - 1.0) > 0.02
        if rescaled:
            if cost_ratio >= 0.999:
                print(f"  ❌ {crop.id}: 비용률 {cost_ratio:.3f} — 재조정 불가", file=sys.stderr)
                missing += 1
                continue
            g = income / (1.0 - cost_ratio)
            c = g * cost_ratio
        print(f"  {crop.id:<26}{gross[0]}  총수입 {g:>12,.0f}  경영비 {c:>12,.0f}  "
              f"비용률 {cost_ratio:.3f}{'  ← 규모 재조정' if rescaled else ''}")

        rec["gross_per_10a"] = round(g)
        rec["cost_per_10a"] = round(c)
        rec["cost_ratio"] = round(cost_ratio, 4)
        rec["cashflow_year"] = gross[0]
        rec["cashflow_rescaled"] = rescaled
        filled += 1

    print(f"\n채움 {filled} / 실패 {missing}", file=sys.stderr)
    if args.write:
        DATA.write_text(json.dumps(raw, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{DATA} 갱신", file=sys.stderr)
    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
