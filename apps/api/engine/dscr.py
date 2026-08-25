"""상환여력 · 한도 역산 · 최소면적."""
from __future__ import annotations

from .income import pyeong_for_income
from .loan import annuity_factor
from .params import LoanProduct, sim_defaults

TARGET_DSCR: float = sim_defaults()["target_dscr"]


def capacity(income: float, living_cost: float, other_debt_service: float) -> float:
    """상환여력 = income - living_cost - other_debt_service"""
    return income - living_cost - other_debt_service


def limit_by_dscr(
    capacity: float, product: LoanProduct, target: float = TARGET_DSCR
) -> float:
    """목표 DSCR을 충족하는 최대 원금 = capacity / (target * annuity_factor).

    제도상 한도(product.limit)로 상단을 자르고, 음수 여력은 0으로 막는다.
    """
    if capacity <= 0:
        return 0.0
    af = annuity_factor(product.rate, product.amort_years)
    return min(capacity / (target * af), product.limit)


def min_area(
    crop_id: str,
    principal: float,
    living_cost: float,
    other_debt_service: float,
    product: LoanProduct,
    target: float = TARGET_DSCR,
) -> float:
    """이 대출을 감당하는 최소 면적(평).
    필요소득 = principal*target*AF + living_cost + other_debt_service
    면적 = 필요소득 / income_per_10a * 302.5"""
    af = annuity_factor(product.rate, product.amort_years)
    required_income = principal * target * af + living_cost + other_debt_service
    return pyeong_for_income(crop_id, required_income)


def dscr_at(principal: float, capacity: float, product: LoanProduct) -> float:
    """상환기 기준 결정론적 DSCR = capacity / 연 원리금."""
    if principal <= 0:
        return float("inf")
    due = principal * annuity_factor(product.rate, product.amort_years)
    return capacity / due
