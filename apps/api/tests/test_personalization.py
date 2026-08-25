"""개인 소득이력 기반 σ 개인화 — 계층적 축소추정."""
from __future__ import annotations

import numpy as np
import pytest

from engine.diagnose import DiagnoseInput, diagnose, resolve_sigma
from engine.params import get_crop
from stats.shrinkage import DEFAULT_PRIOR_DF, MIN_OBSERVATIONS, explain, shrink

CROP = get_crop("strawberry_hydro")
STEADY = [48_000_000, 48_500_000, 47_800_000, 48_200_000, 48_400_000, 48_100_000]
VOLATILE = [30_000_000, 62_000_000, 34_000_000, 70_000_000, 28_000_000, 66_000_000]


def walk(sigma: float, n: int, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return 5e7 * np.exp(np.cumsum(rng.normal(0, sigma, n)))


# ── 축소추정 자체 ────────────────────────────────────────────
def test_short_history_stays_near_the_prior():
    """관측 3개로 계산한 표본표준편차는 못 믿는다. 작목 σ 쪽에 붙어야 한다."""
    r = shrink([40_000_000, 80_000_000, 38_000_000], prior_sigma=0.20)
    assert r.sigma_raw > 1.0                    # 원값은 터무니없다 (수익률 2개)
    assert r.sigma < r.sigma_raw * 0.45         # 대부분이 깎여 나가고
    assert r.weight_individual < 0.15           # 개인값에 거의 실리지 않는다


def test_long_history_converges_to_the_truth():
    """이력이 길면 사전분포를 밀어내고 진값으로 수렴한다."""
    r = shrink(walk(0.35, 60, seed=1), prior_sigma=0.20)
    assert r.sigma == pytest.approx(0.35, abs=0.07)
    assert r.weight_individual > 0.85


def test_individual_weight_grows_monotonically_with_history():
    weights = [shrink(walk(0.25, n, seed=2), 0.20).weight_individual
               for n in (3, 5, 10, 20, 40)]
    assert weights == sorted(weights)
    assert weights[0] < 0.3 < weights[-1]


def test_weight_matches_the_conjugate_formula():
    """σ² = (ν₀σ₀² + (n−1)s²)/(ν₀+n−1) 의 가중치와 정확히 일치해야 한다."""
    r = shrink(walk(0.3, 9, seed=3), prior_sigma=0.20)
    df = r.n_observations - 1
    assert r.weight_individual == pytest.approx(df / (DEFAULT_PRIOR_DF + df))
    expected = np.sqrt(
        (DEFAULT_PRIOR_DF * 0.20 ** 2 + df * r.sigma_raw ** 2) / (DEFAULT_PRIOR_DF + df)
    )
    assert r.sigma == pytest.approx(expected)


def test_steady_farm_gets_lower_sigma_than_volatile_farm():
    calm = shrink(STEADY, prior_sigma=0.20)
    wild = shrink(VOLATILE, prior_sigma=0.20)
    assert calm.sigma < wild.sigma
    assert calm.sigma < 0.20 < wild.sigma      # 사전분포 양쪽으로 갈린다


def test_prior_is_returned_when_history_is_flat():
    """소득이 완전히 일정하면 개인 정보가 없는 것과 같다 — 사전분포로 수렴."""
    r = shrink([5e7] * 6, prior_sigma=0.20)
    assert r.sigma_raw == pytest.approx(0.0, abs=1e-9)
    assert r.sigma < 0.20


def test_too_short_history_is_rejected():
    with pytest.raises(ValueError, match=f"{MIN_OBSERVATIONS}"):
        shrink([5e7, 5.2e7], prior_sigma=0.20)


def test_explain_names_both_numbers():
    text = explain(shrink(VOLATILE, prior_sigma=0.20))
    assert "작목 평균" in text and "0.20" in text


# ── 엔진 연결 ────────────────────────────────────────────────
def test_resolve_sigma_falls_back_without_history():
    sigma, meta = resolve_sigma(CROP, ())
    assert sigma == CROP.sigma
    assert meta["personalized"] is False
    assert meta["source"] == CROP.sigma_source


def test_resolve_sigma_personalizes_with_history():
    sigma, meta = resolve_sigma(CROP, tuple(VOLATILE))
    assert meta["personalized"] is True
    assert meta["source"] == "MEASURED"     # 배지가 사라지는 조건
    assert sigma > CROP.sigma
    assert meta["ci"] and meta["ci"][0] < sigma < meta["ci"][1]


def test_diagnose_uses_personalized_sigma_end_to_end():
    calm = diagnose(DiagnoseInput("strawberry_hydro", 1000, 24_000_000,
                                  income_history=tuple(STEADY)))
    wild = diagnose(DiagnoseInput("strawberry_hydro", 1000, 24_000_000,
                                  income_history=tuple(VOLATILE)))
    assert calm["sigma"] < wild["sigma"]
    # 변동이 큰 농가일수록 감당 가능한 차입이 작아야 한다
    assert calm["limits"]["risk_based"] > wild["limits"]["risk_based"]
    # DSCR 한도는 결정론적이라 σ 와 무관하게 같아야 한다
    assert calm["limits"]["recommended"] == pytest.approx(wild["limits"]["recommended"])


def test_history_survives_the_share_link():
    inp = DiagnoseInput("strawberry_hydro", 1000, 24_000_000,
                        income_history=tuple(STEADY))
    assert DiagnoseInput.decode(inp.encode()).income_history == tuple(STEADY)


def test_two_year_history_is_ignored_not_crashed():
    """이력이 짧으면 조용히 작목 σ 로 되돌아간다."""
    d = diagnose(DiagnoseInput("strawberry_hydro", 1000, 24_000_000,
                               income_history=(4e7, 5e7)))
    assert d["sigma"] == CROP.sigma
    assert d["sigma_personalized"] is False


def test_personalized_result_is_reproducible():
    args = ("strawberry_hydro", 1000, 24_000_000, 0.0, None, "successor_farmer",
            tuple(VOLATILE))
    assert diagnose(DiagnoseInput(*args)) == diagnose(DiagnoseInput(*args))
