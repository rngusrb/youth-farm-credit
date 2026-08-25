"""작목 · 면적 → 연 농업소득."""
from __future__ import annotations

from .params import get_crop, unit_area_pyeong


def annual_income(crop_id: str, pyeong: float) -> float:
    """income_per_10a * (pyeong / 302.5)"""
    if pyeong < 0:
        raise ValueError("pyeong must be non-negative")
    return get_crop(crop_id).income_per_10a * (pyeong / unit_area_pyeong())


def pyeong_for_income(crop_id: str, target_income: float) -> float:
    """목표 소득을 내려면 몇 평이 필요한가 (annual_income 의 역함수)."""
    return target_income / get_crop(crop_id).income_per_10a * unit_area_pyeong()
