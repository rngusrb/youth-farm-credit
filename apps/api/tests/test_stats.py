"""σ 추정기 — 알려진 모수를 되찾는지, 구간이 정직한지."""
from __future__ import annotations

import numpy as np
import pytest

from stats.volatility import (
    annualize,
    bootstrap_ci,
    deseasonalize,
    estimate_from_annual_series,
    estimate_from_price_series,
    log_returns,
    price_to_income_sigma,
)


def synthetic_walk(sigma_per_step: float, n: int, seed: int, start: float = 1e7):
    rng = np.random.default_rng(seed)
    return start * np.exp(np.cumsum(rng.normal(0, sigma_per_step, n)))


def test_recovers_known_sigma_from_annual_series():
    """σ=0.25 로 생성한 40년 경로에서 추정치가 진값 근처로 돌아와야 한다."""
    est = estimate_from_annual_series(synthetic_walk(0.25, 40, seed=1), "합성")
    assert est.sigma == pytest.approx(0.25, abs=0.06)
    assert est.ci_low < 0.25 < est.ci_high
    assert est.n_observations == 39
    assert est.method == "annual_log_return_sd"


def test_confidence_interval_widens_when_sample_is_small():
    """표본이 작을수록 구간이 넓어야 한다 — σ 를 '안다'는 착시를 막는 장치."""
    wide = estimate_from_annual_series(synthetic_walk(0.25, 8, seed=2), "합성")
    narrow = estimate_from_annual_series(synthetic_walk(0.25, 120, seed=2), "합성")
    assert (wide.ci_high - wide.ci_low) > (narrow.ci_high - narrow.ci_low)


def test_annualization_follows_sqrt_rule():
    assert annualize(0.02, 250) == pytest.approx(0.02 * 250 ** 0.5)


def test_price_sigma_is_damped_into_income_sigma():
    """수량이 가격에 음으로 반응하면 소득 변동은 가격 변동보다 작다."""
    assert price_to_income_sigma(0.40, quantity_elasticity=-0.5) == pytest.approx(0.20)
    assert price_to_income_sigma(0.40, quantity_elasticity=0.0) == pytest.approx(0.40)


def test_price_series_estimate_applies_conversion():
    est = estimate_from_price_series(
        synthetic_walk(0.30 / 250 ** 0.5, 1500, seed=3),
        periods_per_year=250,
        quantity_elasticity=-0.5,
    )
    assert est.sigma == pytest.approx(0.15, abs=0.02)   # 0.30 가격 → 0.15 소득
    assert est.assumptions["quantity_elasticity"] == -0.5
    assert "note" in est.assumptions


def test_deseasonalize_removes_a_repeating_pattern():
    """계절 진폭만 있고 추세가 없는 계열은 조정 후 변동성이 크게 줄어야 한다."""
    season = np.tile([100.0, 140.0, 90.0, 110.0], 30)
    assert np.std(log_returns(deseasonalize(season, 4))) < np.std(log_returns(season))


def test_deseasonalize_is_noop_when_series_too_short():
    s = np.array([1.0, 2.0, 3.0])
    assert np.allclose(deseasonalize(s, 12), s)


def test_bootstrap_is_reproducible():
    r = log_returns(synthetic_walk(0.2, 60, seed=4))
    assert bootstrap_ci(r, 1, seed=11) == bootstrap_ci(r, 1, seed=11)


def test_rejects_series_with_no_variation_information():
    with pytest.raises(ValueError):
        log_returns(np.array([100.0]))


def test_non_positive_values_are_dropped():
    """0 이나 결측(-1) 이 섞여도 로그 계산이 깨지지 않아야 한다."""
    assert log_returns(np.array([100.0, 0.0, 110.0, -1.0, 120.0])).size == 2


def test_measured_estimate_flips_the_badge_field():
    fields = estimate_from_annual_series(synthetic_walk(0.2, 30, seed=5), "출처").as_crop_fields()
    assert fields["sigma_source"] == "MEASURED"
    assert len(fields["sigma_ci"]) == 2
    assert fields["sigma_reference"] == "출처"
