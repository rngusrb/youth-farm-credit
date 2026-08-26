"""스트레스 테스트."""
from __future__ import annotations

import pytest

from engine.params import get_product
from engine.stress import PRICE_DROP, run_stress, shocked_income

GROSS = 100_000_000.0
COST = 60_000_000.0   # 소득 4,000만원. 레버리지 2.5배


def test_operating_leverage_amplifies_a_price_drop():
    """총수입 20% 하락이 소득 20% 하락이 아니다 — 이 서비스가 말하려는 핵심."""
    base = GROSS - COST
    hit = shocked_income(gross=GROSS, operating_cost=COST, price_drop=PRICE_DROP)
    assert hit == pytest.approx(80_000_000 - 60_000_000)
    assert (base - hit) / base == pytest.approx(0.5)  # 소득은 50% 빠진다


def test_cost_is_not_assumed_to_fall():
    """경영비 감소율에 공개 근거가 없어 보수적으로 고정한다."""
    assert shocked_income(gross=GROSS, operating_cost=COST, yield_drop=1.0) == -COST


def _run(principal=200_000_000.0):
    return {
        r.key: r
        for r in run_stress(
            gross=GROSS, operating_cost=COST, fixed_outflow=24_000_000,
            principal=principal, product=get_product("successor_farmer"),
            sigma=0.21, max_crisis_prob=0.10, p_disaster=0.08,
        )
    }


def test_income_shocks_are_worse_than_base():
    """소득·금리 충격은 crisis_prob 을 반드시 악화시킨다."""
    r = _run()
    for k in ("price", "yield", "rate", "combined"):
        assert r[k].crisis_prob >= r["base"].crisis_prob, k


def test_disaster_shock_looks_safer_by_crisis_prob_and_we_say_so():
    """재해가 잦아지면 crisis_prob 는 **떨어진다** — 연기된 해를 부족으로 안 세기 때문.

    이걸 숨기지 않고 relies_on_relief 로 표시한다. '제도가 구해준 것' 과
    '농가가 버틴 것' 은 다르다.
    """
    r = _run()
    assert r["disaster"].crisis_prob < r["base"].crisis_prob
    assert r["disaster"].deferral_prob > r["base"].deferral_prob
    assert r["disaster"].relies_on_relief is True
    assert r["base"].relies_on_relief is False
    # 상환연기까지 실패로 세면 재해 쪽이 더 나쁘다는 게 드러난다.
    assert r["disaster"].distress_prob > r["base"].distress_prob


def test_combined_shock_is_the_worst():
    r = _run()
    assert r["combined"].crisis_prob >= max(r["price"].crisis_prob, r["yield"].crisis_prob)


def test_rate_shock_does_not_change_income():
    """금리는 상환액을 올리지 소득을 건드리지 않는다."""
    r = _run()
    assert r["rate"].income == r["base"].income
    assert r["rate"].dscr_median <= r["base"].dscr_median


def test_survival_flag_follows_the_tolerance():
    r = _run()
    for v in r.values():
        assert v.survives == (v.crisis_prob <= 0.10)
