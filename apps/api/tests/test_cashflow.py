"""월별 현금흐름."""
from __future__ import annotations

import pytest

from engine.cashflow import monthly_cashflow


def make(**kw):
    base = dict(gross=100_000_000, operating_cost=40_000_000,
                living_cost=24_000_000, debt_payment=0.0)
    return monthly_cashflow(**{**base, **kw})


def test_annual_net_matches_annual_arithmetic():
    """월별로 쪼개도 1년 합계는 연 단위 계산과 같아야 한다."""
    cf = make(debt_payment=6_000_000)
    assert cf.annual_net == pytest.approx(100_000_000 - 40_000_000 - 24_000_000 - 6_000_000)


def test_revenue_lands_only_in_harvest_months():
    cf = make(harvest_months=(6, 7))
    got = {m.month for m in cf.months if m.revenue > 0}
    assert got == {6, 7}


def test_costs_are_spread_every_month():
    cf = make(harvest_months=(6, 7))
    assert all(m.operating > 0 and m.living > 0 for m in cf.months)


def test_trough_comes_before_harvest():
    """수확 전까지는 나가기만 한다. 연간 흑자여도 그 사이에 바닥이 온다."""
    cf = make(harvest_months=(10,))
    assert cf.trough_month < 10
    assert cf.trough_balance < 0
    assert cf.working_capital_need > 0


def test_single_harvest_needs_more_working_capital_than_spread_harvest():
    """출하가 한 달에 몰릴수록 필요한 운전자금이 커진다 — 이 서비스의 핵심 주장이다."""
    one = make(harvest_months=(10,))
    many = make(harvest_months=(5, 6, 7, 8, 9, 10))
    assert one.working_capital_need > many.working_capital_need


def test_unknown_harvest_is_flagged_not_guessed():
    """출하월을 모르면 균등 배분하되 '모른다' 는 사실을 숨기지 않는다."""
    cf = make()
    assert cf.harvest_known is False
    assert cf.harvest_months == ()
    assert all(m.revenue > 0 for m in cf.months)


def test_debt_is_paid_after_last_harvest():
    cf = make(harvest_months=(6, 7), debt_payment=6_000_000)
    paid = [m.month for m in cf.months if m.debt > 0]
    assert paid == [8]


def test_debt_payment_deepens_the_trough_but_after_harvest():
    with_debt = make(harvest_months=(6, 7), debt_payment=30_000_000)
    without = make(harvest_months=(6, 7))
    assert with_debt.annual_net < without.annual_net
