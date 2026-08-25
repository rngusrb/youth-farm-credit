"""상환 스케줄 · 연금현가. 결정론적 계산만 담당한다."""
from __future__ import annotations

import numpy as np

from .params import LoanProduct


def annuity_factor(rate: float, n: int) -> float:
    """원금 1당 연 상환액. rate*(1+rate)^n / ((1+rate)^n - 1)"""
    if n <= 0:
        raise ValueError("n must be positive")
    if rate == 0:
        return 1.0 / n
    g = (1.0 + rate) ** n
    return rate * g / (g - 1.0)


def repayment_schedule(principal: float, product: LoanProduct) -> np.ndarray:
    """길이 grace+amort 배열. 거치기간은 이자만(principal*rate),
    이후는 원리금균등(principal*annuity_factor)."""
    grace = np.full(product.grace_years, principal * product.rate)
    amort = np.full(
        product.amort_years,
        principal * annuity_factor(product.rate, product.amort_years),
    )
    return np.concatenate([grace, amort])


def grace_payment(principal: float, product: LoanProduct) -> float:
    return principal * product.rate


def amort_payment(principal: float, product: LoanProduct) -> float:
    return principal * annuity_factor(product.rate, product.amort_years)


def cliff_multiple(principal: float, product: LoanProduct) -> float:
    """거치 → 상환기 전환 시 연 상환액이 몇 배로 뛰는가."""
    g = grace_payment(principal, product)
    if g == 0:
        return 0.0
    return amort_payment(principal, product) / g
