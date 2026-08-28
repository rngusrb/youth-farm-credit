"""작목 · 면적 → 연 농업소득."""
from __future__ import annotations

import math

from .params import get_crop, unit_area_pyeong


def annual_income(crop_id: str, pyeong: float) -> float:
    """income_per_10a * (pyeong / 302.5)"""
    if pyeong < 0:
        raise ValueError("pyeong must be non-negative")
    return get_crop(crop_id).income_per_10a * (pyeong / unit_area_pyeong())


def pyeong_for_income(crop_id: str, target_income: float) -> float:
    """목표 소득을 내려면 몇 평이 필요한가 (annual_income 의 역함수)."""
    return target_income / get_crop(crop_id).income_per_10a * unit_area_pyeong()


# 표준정규 80% 중앙구간의 경계. simulate.draw_paths 와 같은 분포를 쓴다.
_Z80 = 1.2815515655446004


def income_band(expected_income: float, sigma: float) -> tuple[float, float]:
    """평년 소득이 흔들리는 범위 (하위 10% ~ 상위 10%).

    화면이 "σ 0.215" 대신 "4,700만~7,200만원 사이" 라고 말할 수 있게 엔진이 낸다.
    σ 를 화면에서 ±% 로 환산하면 그건 화면이 만든 숫자다 — 여기서 만든다.

    분포는 시뮬레이터와 **같은 것**을 쓴다:
        shock = exp(σ·Z − σ²/2),  income = expected_income × shock
    (`simulate.draw_paths` 참조. 여기가 어긋나면 리포트와 화면이 다른 말을 한다.)
    """
    if expected_income <= 0 or sigma <= 0:
        return (expected_income, expected_income)
    half = math.exp(-0.5 * sigma**2)
    lo = expected_income * math.exp(-_Z80 * sigma) * half
    hi = expected_income * math.exp(+_Z80 * sigma) * half
    return (lo, hi)
