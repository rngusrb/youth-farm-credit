"""engine/switch.py — 작목 전환 후보: 같은 면적으로 다른 작목을 하면 어떻게 되나.

## 무엇을 하고 무엇을 하지 않나

**한다**: 같은 면적으로 38작목을 전부 다시 계산해 소득·변동성(σ)·출하월을 견준다.
출하월이 겹치지 않는 조합은 **분산 효과**까지 계산한다.

**하지 않는다**: 전환을 권하지 않는다. 시설·품종 전환 비용 데이터가 공개 통계에 없어서
**전환비를 반영하지 못한다**. 그걸 빼고 "바꾸면 좋다"고 말하면 거짓이 된다.
그래서 결과에 `cost_not_modelled=True` 를 실어 화면이 반드시 밝히게 한다.

## 분산 효과를 어떻게 재나

두 작목을 절반씩 하면 소득 변동은 단순 평균이 아니다. 출하월이 겹치지 않으면 가격 충격이
같은 달에 오지 않아 상쇄된다. 상관을 직접 추정할 자료가 없으므로 **출하월 겹침 비율**을
상관의 대리값으로 쓴다 — 이건 가정이므로 `overlap_ratio` 를 함께 돌려준다.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from .income import annual_income
from .params import crops, get_crop


@dataclass(frozen=True)
class Candidate:
    crop_id: str
    crop_name: str
    income: float               # 같은 면적으로 이 작목을 했을 때 연 소득
    income_ratio: float         # 현재 작목 대비
    sigma: float
    sigma_delta: float          # 현재 대비 변동성 차이 (음수면 더 안정)
    cost_ratio: float | None
    harvest_months: list[int]
    overlap_ratio: float        # 현재 작목과 출하월이 겹치는 비율 (0=안 겹침)
    blended_sigma: float | None  # 절반씩 했을 때의 변동성 추정
    has_market_data: bool


def _overlap(a: tuple[int, ...], b: tuple[int, ...]) -> float:
    if not a or not b:
        return 1.0                      # 모르면 겹친다고 보수적으로 본다
    sa, sb = set(a), set(b)
    return len(sa & sb) / len(sa | sb)


def _blend_sigma(s1: float, s2: float, overlap: float) -> float:
    """절반씩 섞었을 때의 변동성. 상관을 출하월 겹침으로 근사한다.

    rho = overlap 으로 두면 겹침이 0일 때 sqrt((s1²+s2²))/2, 1일 때 (s1+s2)/2 가 된다.
    """
    rho = max(0.0, min(1.0, overlap))
    var = 0.25 * (s1 ** 2 + s2 ** 2 + 2 * rho * s1 * s2)
    return math.sqrt(var)


def switch_candidates(current_crop_id: str, pyeong: float, top_n: int = 5) -> dict:
    """같은 면적으로 바꿔볼 만한 작목. **전환 비용은 반영하지 않는다.**"""
    cur = get_crop(current_crop_id)
    cur_income = annual_income(current_crop_id, pyeong)
    cur_sigma = float(cur.sigma)
    cur_months = tuple(cur.harvest_months or ())

    out: list[Candidate] = []
    for c in crops().values():
        if c.id == cur.id or not c.income_per_10a or not c.sigma:
            continue
        months = tuple(c.harvest_months or ())
        ov = _overlap(cur_months, months)
        income = annual_income(c.id, pyeong)
        gross, cost = c.gross_per_10a, c.cost_per_10a
        out.append(Candidate(
            crop_id=c.id,
            crop_name=c.name,
            income=income,
            income_ratio=(income / cur_income) if cur_income else 0.0,
            sigma=float(c.sigma),
            sigma_delta=float(c.sigma) - cur_sigma,
            cost_ratio=(cost / gross) if (gross and cost) else None,
            harvest_months=list(months),
            overlap_ratio=ov,
            blended_sigma=_blend_sigma(cur_sigma, float(c.sigma), ov),
            has_market_data=bool(c.market),
        ))

    # 소득을 크게 잃지 않으면서 변동성이 낮아지는 순
    ranked = sorted(
        (c for c in out if c.income_ratio >= 0.8),
        key=lambda c: (c.sigma_delta, -c.income_ratio),
    )
    # 섞었을 때 현재보다 안정되는 조합
    diversify = sorted(
        (c for c in out if c.blended_sigma is not None and c.blended_sigma < cur_sigma),
        key=lambda c: c.blended_sigma,
    )

    return {
        "current": {
            "crop_id": cur.id, "crop_name": cur.name,
            "income": cur_income, "sigma": cur_sigma,
            "harvest_months": list(cur_months),
        },
        "replace": [vars(c) for c in ranked[:top_n]],
        "diversify": [vars(c) for c in diversify[:top_n]],
        "cost_not_modelled": True,
        "note": ("시설·품종 **전환 비용은 반영하지 않았습니다** — 공개 통계에 근거가 없어 "
                 "지어내지 않았습니다. 실제로는 전환비와 수확까지의 공백을 함께 따져야 합니다. "
                 "섞었을 때의 변동성은 출하월 겹침을 상관의 대리값으로 쓴 추정치입니다."),
    }
