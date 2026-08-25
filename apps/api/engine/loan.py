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


def equal_principal_factor(rate: float, n: int) -> float:
    """원금 1당 **최대** 연 상환액 = 1/n + rate.

    원금균등은 원금 몫이 고정이고 이자는 잔액에 붙으므로, 상환 첫해가 가장 무겁고
    이후 매년 줄어든다. 한도를 역산할 때 기준이 되는 것은 평균이 아니라 이 최댓값이다.
    """
    if n <= 0:
        raise ValueError("n must be positive")
    return 1.0 / n + rate


def peak_payment_factor(product: LoanProduct) -> float:
    """상품의 상환방식에 맞는 '원금 1당 최대 연 상환액'."""
    if product.amort_method == "equal_payment":
        return annuity_factor(product.rate, product.amort_years)
    return equal_principal_factor(product.rate, product.amort_years)


def repayment_schedule(principal: float, product: LoanProduct) -> np.ndarray:
    """길이 grace+amort 배열.

    거치기간은 이자만(principal*rate). 상환기는 상품의 방식을 따른다.

    · equal_principal (후계농 육성자금) — 원금 P/n 고정 + 잔액이자.
      상환 첫해가 최대이고 이후 매년 줄어든다.
    · equal_payment — 원리금균등. 매년 같은 금액.
    """
    grace = np.full(product.grace_years, principal * product.rate)
    n, rate = product.amort_years, product.rate

    if product.amort_method == "equal_payment":
        amort = np.full(n, principal * annuity_factor(rate, n))
    else:
        unit = principal / n
        balance = principal - unit * np.arange(n)
        amort = unit + balance * rate
    return np.concatenate([grace, amort])


def grace_payment(principal: float, product: LoanProduct) -> float:
    return principal * product.rate


def amort_payment(principal: float, product: LoanProduct) -> float:
    """상환기 최대 연 상환액. 원금균등에서는 상환 첫해 금액이다."""
    return principal * peak_payment_factor(product)


def total_interest(principal: float, product: LoanProduct) -> float:
    return float(repayment_schedule(principal, product).sum()) - principal


def cliff_multiple(principal: float, product: LoanProduct) -> float:
    """거치 → 상환기 전환 시 연 상환액이 몇 배로 뛰는가 (최대치 기준)."""
    g = grace_payment(principal, product)
    if g == 0:
        return 0.0
    return amort_payment(principal, product) / g
