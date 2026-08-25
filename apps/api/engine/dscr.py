"""상환여력 · 한도 역산 · 최소면적."""
from __future__ import annotations

from .income import pyeong_for_income
from .loan import peak_payment_factor
from .params import LoanProduct, sim_defaults

TARGET_DSCR: float = sim_defaults()["target_dscr"]


def capacity(income: float, living_cost: float, other_debt_service: float) -> float:
    """상환여력 = income - living_cost - other_debt_service"""
    return income - living_cost - other_debt_service


def limit_by_dscr(
    capacity: float, product: LoanProduct, target: float = TARGET_DSCR
) -> float:
    """목표 DSCR을 충족하는 최대 원금 = capacity / (target × 최대 연 상환액 계수).

    원금균등은 상환액이 매년 줄어든다. 평균으로 역산하면 가장 무거운 첫 해에
    기준을 못 지키므로, **최대 상환액**을 기준으로 잡는다.
    제도상 한도(product.limit)로 상단을 자르고, 음수 여력은 0으로 막는다.
    """
    if capacity <= 0:
        return 0.0
    return min(capacity / (target * peak_payment_factor(product)), product.limit)


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
    peak = peak_payment_factor(product)
    required_income = principal * target * peak + living_cost + other_debt_service
    return pyeong_for_income(crop_id, required_income)


def dscr_at(principal: float, capacity: float, product: LoanProduct) -> float:
    """가장 무거운 해(상환 첫해) 기준 결정론적 DSCR."""
    if principal <= 0:
        return float("inf")
    return capacity / (principal * peak_payment_factor(product))
