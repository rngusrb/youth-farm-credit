"""요인분해 · 계층 축소 · 변동성 시간구조."""
from __future__ import annotations

import math

import numpy as np
import pytest

from stats.factors import MIN_YEARS, decompose, decompose_all, median_elasticity
from estimators.garch import (
    annual_average_series,
    annual_price_sigma,
    ewma_volatility,
    fit_garch,
    segmented_log_returns,
)
from estimators.hierarchical import CropObservation, fit_population, pool, pool_all
from stats.kosis import IncomeRow


def rows_for(crop: str, years: range, price, qty, cost) -> list[IncomeRow]:
    """가격·수량·비용에서 총수입·소득을 일관되게 만들어낸 합성 관측."""
    out: list[IncomeRow] = []
    for i, y in enumerate(years):
        p, q, c = price[i], qty[i], cost[i]
        revenue = p * q
        out += [
            IncomeRow(y, crop, "농가수취가격", p, "원"),
            IncomeRow(y, crop, "주산물수량", q, "kg"),
            IncomeRow(y, crop, "총수입", revenue, "원"),
            IncomeRow(y, crop, "경영비", c, "원"),
            IncomeRow(y, crop, "소득", revenue - c, "원"),
        ]
    return out


# ── 요인분해 ─────────────────────────────────────────────────
def test_price_only_variation_is_attributed_to_price():
    """수량·비용을 고정하고 가격만 흔들면 기여도가 가격으로 몰려야 한다."""
    n = 12
    rng = np.random.default_rng(0)
    price = 1000 * np.exp(rng.normal(0, 0.15, n))
    rows = rows_for("합성", range(2013, 2013 + n), price, [100.0] * n, [50_000.0] * n)
    f = decompose(rows, "합성")
    assert f is not None
    assert f.share_price > 0.9
    assert abs(f.share_quantity) < 0.05
    assert f.driver == "price"


def test_quantity_only_variation_is_attributed_to_quantity():
    n = 12
    rng = np.random.default_rng(1)
    qty = 100 * np.exp(rng.normal(0, 0.15, n))
    rows = rows_for("합성", range(2013, 2013 + n), [1000.0] * n, qty, [50_000.0] * n)
    f = decompose(rows, "합성")
    assert f.share_quantity > 0.9
    assert f.driver == "quantity"


def test_shares_close_to_one():
    """선형근사가 성립하면 기여도 합이 1 근처여야 한다."""
    n = 14
    rng = np.random.default_rng(2)
    rows = rows_for(
        "합성", range(2011, 2011 + n),
        1000 * np.exp(rng.normal(0, 0.12, n)),
        100 * np.exp(rng.normal(0, 0.08, n)),
        50_000 * np.exp(rng.normal(0, 0.10, n)),
    )
    f = decompose(rows, "합성")
    assert f.share_price + f.share_quantity + f.share_cost + f.residual == pytest.approx(1.0)
    assert abs(f.residual) < 0.15


def test_negative_elasticity_is_recovered():
    """풍년이면 값이 떨어지는 관계를 실제로 잡아내는지."""
    n = 16
    rng = np.random.default_rng(3)
    shock = rng.normal(0, 0.2, n)
    price = 1000 * np.exp(shock)
    qty = 100 * np.exp(-0.4 * shock + rng.normal(0, 0.02, n))   # 진짜 탄력성 -0.4
    rows = rows_for("합성", range(2010, 2010 + n), price, qty, [50_000.0] * n)
    f = decompose(rows, "합성")
    assert f.elasticity == pytest.approx(-0.4, abs=0.12)
    assert f.correlation < -0.8


def test_short_series_is_skipped():
    n = MIN_YEARS - 1
    rows = rows_for("합성", range(2018, 2018 + n), [1000.0] * n, [100.0] * n, [5e4] * n)
    assert decompose(rows, "합성") is None


def test_negative_income_is_skipped():
    n = 12
    rows = rows_for("합성", range(2013, 2013 + n), [10.0] * n, [1.0] * n, [1e6] * n)
    assert decompose(rows, "합성") is None


def test_median_elasticity_over_crops():
    profiles = {}
    rng = np.random.default_rng(4)
    for k, true_el in enumerate((-0.2, -0.4, -0.6)):
        n = 14
        shock = rng.normal(0, 0.2, n)
        rows = rows_for(
            f"작목{k}", range(2011, 2011 + n),
            1000 * np.exp(shock), 100 * np.exp(true_el * shock), [5e4] * n,
        )
        profiles[f"작목{k}"] = decompose(rows, f"작목{k}")
    assert median_elasticity(profiles) == pytest.approx(-0.4, abs=0.1)


# ── 계층 축소 ────────────────────────────────────────────────
def obs(n_crops=12, sigma=0.2, n_returns=11):
    return [CropObservation(f"c{i}", sigma * (1 + 0.3 * (i % 5 - 2)), n_returns)
            for i in range(n_crops)]


def test_population_removes_sampling_noise_from_spread():
    """관측된 산포에서 표본오차 몫을 빼야 tau 가 부풀지 않는다."""
    noisy = fit_population(obs(n_returns=4))     # 관측 적음 = 노이즈 큼
    clean = fit_population(obs(n_returns=40))    # 관측 많음
    assert noisy.tau < clean.tau


def test_short_series_gets_pulled_to_the_population():
    pop = fit_population(obs())
    long_ = pool(CropObservation("긴계열", 0.40, 40), pop)
    short = pool(CropObservation("짧은계열", 0.40, 3), pop)
    assert long_.weight_own > short.weight_own
    assert abs(short.sigma - pop.typical_sigma) < abs(long_.sigma - pop.typical_sigma)


def test_no_observation_falls_back_entirely():
    """계열이 아예 없으면 전체 분포를 그대로 쓴다 (수경 2개년 상황)."""
    pop = fit_population(obs())
    p = pool(CropObservation("수경", 0.0, 1), pop)
    assert p.weight_own == 0.0
    assert p.sigma == pytest.approx(pop.typical_sigma)


def test_pooling_never_produces_negative_or_zero_sigma():
    pop = fit_population(obs())
    for sigma in (0.01, 0.05, 0.5, 1.5):
        assert pool(CropObservation("x", sigma, 5), pop).sigma > 0


def test_pooling_is_monotone_in_the_raw_estimate():
    pop = fit_population(obs())
    a = pool(CropObservation("a", 0.10, 11), pop).sigma
    b = pool(CropObservation("b", 0.30, 11), pop).sigma
    assert a < b


def test_population_needs_enough_crops():
    with pytest.raises(ValueError, match="3종"):
        fit_population(obs(n_crops=2))


def test_pool_all_returns_every_crop():
    pop, pooled = pool_all(obs(n_crops=9))
    assert len(pooled) == 9
    assert pop.n_crops == 9


# ── 변동성 시간구조 ──────────────────────────────────────────
def daily(n: int, sigma: float, seed: int, start_day: int = 1) -> list[tuple[str, float]]:
    rng = np.random.default_rng(seed)
    p = 10_000 * np.exp(np.cumsum(rng.normal(0, sigma, n)))
    from datetime import date, timedelta

    d0 = date(2015, 1, 1) + timedelta(days=start_day)
    return [((d0 + timedelta(days=i)).strftime("%Y%m%d"), float(v)) for i, v in enumerate(p)]


def test_seasonal_gaps_are_not_treated_as_price_moves():
    """비수확기 공백을 이어 붙이면 계절 전환이 폭락으로 잡힌다."""
    a = daily(200, 0.02, seed=5)
    b = [(f"2016{d[4:]}", v * 3) for d, v in daily(200, 0.02, seed=6)]  # 훌쩍 뛴 다음 시즌
    joined = a + b
    with_gap, _ = segmented_log_returns(joined, max_gap_days=7)
    naive = np.diff(np.log([v for _, v in joined]))
    assert with_gap.size < naive.size          # 공백 구간이 빠졌고
    assert with_gap.max() < naive.max()        # 가짜 폭등도 사라졌다


def test_trading_days_per_year_reflects_seasonality():
    _, dpy = segmented_log_returns(daily(300, 0.02, seed=7))
    assert 300 < dpy < 400        # 연속 300일이면 연 300일대


def test_garch_recovers_persistence_on_synthetic_data():
    """α+β 를 높게 잡아 만든 계열에서 높은 지속성이 잡혀야 한다."""
    rng = np.random.default_rng(8)
    n, omega, alpha, beta = 3000, 1e-6, 0.08, 0.90
    var, out = omega / (1 - alpha - beta), []
    price = 10_000.0
    from datetime import date, timedelta

    d0 = date(2015, 1, 1)
    for i in range(n):
        e = rng.normal(0, math.sqrt(var))
        price *= math.exp(e)
        out.append(((d0 + timedelta(days=i)).strftime("%Y%m%d"), price))
        var = omega + alpha * e * e + beta * var
    fit = fit_garch(out)
    assert fit is not None
    assert fit.persistence > 0.8
    assert fit.half_life_days > 3


def test_garch_needs_enough_observations():
    assert fit_garch(daily(100, 0.02, seed=9)) is None


def test_ewma_agrees_with_garch_order_of_magnitude():
    series = daily(1500, 0.02, seed=10)
    fit, e = fit_garch(series), ewma_volatility(series)
    assert fit and e
    assert 0.4 < e / fit.long_run_annual_sigma < 2.5


def test_annual_average_collapses_daily_noise():
    """일별 σ 를 √250 배 하면 과대하다. 연평균의 σ 가 소득과 맞물리는 값이다."""
    series = daily(2000, 0.03, seed=11)
    fit = fit_garch(series)
    assert annual_price_sigma(series) < fit.long_run_annual_sigma


def test_annual_average_needs_enough_days_per_year():
    sparse = [("20200101", 100.0), ("20210101", 120.0)]
    assert annual_average_series(sparse, min_days=20) == []
    assert annual_price_sigma(sparse) is None


# ── 이월 시세 (DATA-003) ──────────────────────────────────────────────
def _series(n: int, hold: int, seed: int = 7) -> list[tuple[str, float]]:
    """hold 일마다 한 번만 가격이 바뀌는 계열. hold=1 이면 매일 거래."""
    rng = np.random.default_rng(seed)
    out, v = [], 100.0
    for i in range(n):
        if i % hold == 0:
            v = 100.0 * float(np.exp(rng.normal(0, 0.03)))
        out.append((f"2024{(i // 25) % 12 + 1:02d}{i % 25 + 1:02d}", v))
    return out


def test_movement_ratio_detects_carried_quotes():
    from estimators.garch import price_movement_ratio

    assert price_movement_ratio(_series(300, 1)) > 0.95
    assert price_movement_ratio(_series(300, 5)) < 0.30
    assert price_movement_ratio([("20240101", 1.0)]) == 0.0


def test_regime_is_withheld_when_quotes_are_carried():
    """모르는 것을 '평상' 이라고 하지 않는다 — None 을 돌려준다.

    사고 배경: KAMIS 는 거래가 없어도 직전 시세를 이월한다. 이월된 날은 수익률이
    0 이라 GARCH 가 '조용하다' 고 읽는데, 조용한 건 시장이 아니라 집계 방식이다.
    실측(2021~2024): 들깨 17% · 참깨 20% · 생강 40% vs 수박 74% … 애호박 99%.
    """
    from estimators.garch import fit_garch

    live = fit_garch(_series(400, 1))
    carried = fit_garch(_series(400, 5))
    assert live is not None and carried is not None
    assert live.quote_is_carried is False
    assert live.regime in ("calm", "normal", "turbulent")
    assert carried.quote_is_carried is True
    assert carried.regime is None


def test_threshold_sits_in_an_empty_region_of_the_measured_distribution():
    """임계값 0.60 은 실측 분포의 빈 구간(40%~74%)에 있다. 경계 근처 작목이 없다."""
    from estimators.garch import MIN_PRICE_MOVEMENT_RATIO

    measured_low = [0.17, 0.20, 0.40]      # 들깨 · 참깨 · 생강
    measured_high = [0.74, 0.76, 0.86, 0.99]  # 수박 · 고구마 · 딸기 · 애호박
    assert max(measured_low) < MIN_PRICE_MOVEMENT_RATIO < min(measured_high)
