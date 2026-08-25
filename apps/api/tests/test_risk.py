"""위험기반 한도 · σ 불확실성 밴드."""
from __future__ import annotations

import pytest

from engine import annual_income, get_product
from engine.diagnose import DiagnoseInput, diagnose
from engine.risk_limit import (
    DEFAULT_MAX_CRISIS_PROB,
    limit_by_crisis_prob,
    sigma_sensitivity,
    uncertainty_band,
)
from engine.simulate import crisis_prob_at, draw_paths, evaluate

PRODUCT = get_product("successor_farmer")
LIVING = 24_000_000


def paths_for(pyeong: float, sigma: float = 0.20, crop: str = "strawberry_hydro"):
    return draw_paths(annual_income(crop, pyeong), sigma, PRODUCT)


def test_crisis_prob_at_matches_full_evaluation():
    """경량 평가가 evaluate 와 정확히 같은 값을 내야 이분탐색이 신뢰된다."""
    p = paths_for(1000)
    for principal in (1e8, 3e8, 5e8):
        assert crisis_prob_at(p, principal, LIVING) == pytest.approx(
            evaluate(p, principal, LIVING).crisis_prob
        )


def test_crisis_prob_is_monotone_in_principal():
    """공통난수 덕분에 표본오차 없이 단조증가해야 한다 — 이분탐색의 전제."""
    p = paths_for(1000)
    probs = [crisis_prob_at(p, x * 5e7, LIVING) for x in range(1, 11)]
    assert probs == sorted(probs)


def test_risk_limit_sits_on_the_target():
    """찾은 한도에서는 목표를 지키고, 조금만 더 빌리면 넘어야 한다."""
    p = paths_for(1000)
    limit = limit_by_crisis_prob(p, LIVING, DEFAULT_MAX_CRISIS_PROB)
    assert 0 < limit < PRODUCT.limit
    assert crisis_prob_at(p, limit, LIVING) <= DEFAULT_MAX_CRISIS_PROB
    assert crisis_prob_at(p, limit + 2_000_000, LIVING) > DEFAULT_MAX_CRISIS_PROB


def test_risk_limit_caps_at_product_limit():
    """여유가 충분하면 제도 한도에서 멈춘다 (케이스 B)."""
    p = paths_for(2500)
    assert limit_by_crisis_prob(p, LIVING) == PRODUCT.limit


def test_risk_limit_is_never_above_product_limit():
    for pyeong in (500, 1000, 2000, 4000):
        assert limit_by_crisis_prob(paths_for(pyeong), LIVING) <= PRODUCT.limit


def test_higher_sigma_lowers_risk_limit():
    """변동성이 크다고 보면 감당 가능한 금액은 줄어야 한다."""
    limits = [
        limit_by_crisis_prob(paths_for(1000, sigma=s), LIVING)
        for s in (0.10, 0.20, 0.30)
    ]
    assert limits[0] > limits[1] > limits[2]


def test_sigma_does_not_move_the_dscr_limit():
    """σ 는 확률 지표만 움직이고 결정론적 DSCR 한도는 건드리지 않는다."""
    a = diagnose(DiagnoseInput("strawberry_hydro", 1000, LIVING, 0, 5e8))
    points = sigma_sensitivity(
        annual_income("strawberry_hydro", 1000), LIVING, 3e8, PRODUCT,
        sigma_grid=(0.10, 0.20, 0.30),
    )
    assert len({round(p.dscr_median, 6) for p in points}) > 1   # 확률 지표는 움직이고
    assert a["limits"]["recommended"] == pytest.approx(336_448_564, rel=1e-6)  # 한도는 고정


def test_risk_limit_is_stricter_than_dscr_limit_when_income_is_thin():
    """케이스 A 처럼 여력이 빠듯하면 위험기반 한도가 DSCR 한도보다 보수적이다."""
    d = diagnose(DiagnoseInput("strawberry_hydro", 1000, LIVING, 0, 5e8))
    assert d["limits"]["risk_based"] < d["limits"]["recommended"]
    assert d["scenarios"]["at_risk_based"]["crisis_prob"] <= DEFAULT_MAX_CRISIS_PROB


def test_band_reports_range_across_sigma():
    band = uncertainty_band(
        annual_income("strawberry_hydro", 1000), LIVING, 336_448_564, PRODUCT,
        sigma=0.20,
    )
    assert len(band.sigma_grid) == 5
    assert band.crisis_prob_low < band.crisis_prob_high
    assert band.risk_limit_low < band.risk_limit_high


def test_break_even_sigma_is_none_when_even_calm_is_risky():
    """가장 낙관적인 σ 에서도 목표를 못 지키면 None 을 반환한다."""
    band = uncertainty_band(
        annual_income("strawberry_hydro", 1000), LIVING, 336_448_564, PRODUCT,
        sigma=0.20,
    )
    assert band.break_even_sigma is None


def test_break_even_sigma_found_when_crossing_inside_grid():
    """케이스 C 는 σ 가 커지면서 목표를 넘는다 — 교차점이 잡혀야 한다."""
    d = diagnose(DiagnoseInput("tomato_hydro", 2000, LIVING, 3_000_000, 5e8))
    be = d["uncertainty"]["break_even_sigma"]
    assert be is not None
    assert 0.20 < be < 0.30


def test_diagnose_is_reproducible_with_new_pipeline():
    a = diagnose(DiagnoseInput("strawberry_hydro", 1000, LIVING, 0, 5e8))
    b = diagnose(DiagnoseInput("strawberry_hydro", 1000, LIVING, 0, 5e8))
    assert a == b


# ── 제약의 종류 구분 ─────────────────────────────────────────
def test_livelihood_constraint_is_named_when_loan_is_not_the_problem():
    """소득이 생활비를 못 대면 차입을 0 으로 줄여도 위기가 남는다.
    이때 '한도 0원'은 대출 판정이 아니라 생계 판정이다."""
    d = diagnose(DiagnoseInput("rose", 800, LIVING, 0, 5e8))
    assert d["income"]["capacity"] > 0            # 장부상 여력은 있는데
    assert d["limits"]["binding_constraint"] == "livelihood"
    assert d["limits"]["livelihood_floor_prob"] > DEFAULT_MAX_CRISIS_PROB
    assert d["limits"]["risk_based"] == 0


def test_loan_constraint_when_scale_is_sufficient():
    d = diagnose(DiagnoseInput("rose", 1500, LIVING, 0, 5e8))
    assert d["limits"]["binding_constraint"] == "loan"
    assert d["limits"]["livelihood_floor_prob"] <= DEFAULT_MAX_CRISIS_PROB
    assert d["limits"]["risk_based"] > 0


def test_livelihood_floor_is_independent_of_principal():
    """생계 바닥 확률은 명목 원금으로 재므로 차입 규모에 흔들리지 않는다."""
    a = diagnose(DiagnoseInput("rose", 800, LIVING, 0, 5e8))
    b = diagnose(DiagnoseInput("rose", 800, LIVING, 0, 1e8))
    assert a["limits"]["livelihood_floor_prob"] == pytest.approx(
        b["limits"]["livelihood_floor_prob"]
    )


def test_measured_sigma_moves_the_risk_limit():
    """실측 σ 가 가정값과 다르면 한도도 달라져야 한다 (토마토 수경 σ 0.29)."""
    measured = diagnose(DiagnoseInput("tomato_hydro", 2000, LIVING, 3_000_000, 5e8))
    assumed = diagnose(DiagnoseInput("tomato_hydro", 2000, LIVING, 3_000_000, 5e8),
                       sigma_override=0.20)
    assert measured["sigma"] > 0.25
    assert measured["limits"]["risk_based"] < assumed["limits"]["risk_based"]


def test_sigma_grid_always_contains_the_applied_value():
    """작목마다 σ 가 달라 고정 격자를 쓰면 적용값이 격자 밖으로 나간다."""
    from engine.risk_limit import sigma_grid_around

    for crop_id in ("strawberry_hydro", "rose", "spinach"):
        d = diagnose(DiagnoseInput(crop_id, 4000, LIVING, 0, 5e8))
        if not d.get("uncertainty"):
            continue        # 상환여력이 없으면 밴드를 계산하지 않는다
        grid = [p["sigma"] for p in d["uncertainty"]["sigma_grid"]]
        assert any(abs(g - d["sigma"]) < 1e-3 for g in grid), (crop_id, grid, d["sigma"])
        assert grid == sorted(grid)
        assert min(grid) < d["sigma"] < max(grid)


def test_sigma_grid_scales_with_the_crop():
    from engine.risk_limit import sigma_grid_around

    assert max(sigma_grid_around(0.33)) > max(sigma_grid_around(0.11))
