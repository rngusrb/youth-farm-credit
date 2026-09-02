"""개인 소득이력 기반 σ 개인화 — 계층적 축소추정."""
from __future__ import annotations

import numpy as np
import pytest

from engine.diagnose import DiagnoseInput, diagnose, resolve_sigma
from engine.params import get_crop
from estimators.shrinkage import DEFAULT_PRIOR_DF, MIN_OBSERVATIONS, explain, shrink

CROP = get_crop("strawberry_hydro")
STEADY = [48_000_000, 48_500_000, 47_800_000, 48_200_000, 48_400_000, 48_100_000]
# 평균은 STEADY 와 **정확히 같게** 맞춘다 (둘 다 합계 2억 8,900만원).
# 2026-09-02 진단이 소득 수준까지 실적에서 가져가게 되면서, 평균이 0.35% 달랐던 탓에
# "σ 와 무관하게 DSCR 한도는 같다"는 단언이 깨졌다. 그 단언은 σ 만 말하는데
# 두 이력이 σ 와 평균 둘 다 달라 뒤섞여 있었다 — 테스트가 주장을 못 지키고 있었다.
VOLATILE = [30_000_000, 62_000_000, 34_000_000, 70_000_000, 28_000_000, 65_000_000]


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
    # 시장 공통분만 실측이므로 통짜 MEASURED 가 아니라 부분 실측이어야 한다
    assert meta["source"] == "PARTIAL"
    assert 0.2 < meta["assumed_variance_share"] < 0.8
    assert meta["ci_scope"] == "market_common_only"


def test_resolve_sigma_personalizes_with_history():
    sigma, meta = resolve_sigma(CROP, tuple(VOLATILE))
    assert meta["personalized"] is True
    assert meta["source"] == "PERSONAL"          # 가정이 섞이지 않는다
    assert meta["assumed_variance_share"] == 0.0
    assert meta["ci_scope"] == "own_history"
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


# ── 소득 수준도 실적을 따라간다 ────────────────────────────────────────
#
# 사고 이력 2026-09-02: 실적을 받아 놓고 σ 에만 쓰고 소득 수준에는 안 썼다.
# 그래서 농가가 한 화면에서 "내 소득 6,304만원"(추정)과 "내 소득은 평균의
# 77%(4,833만원)"(실적)를 동시에 봤다. 엔진은 일관됐고 화면이 모순됐다.


def test_income_level_follows_actual_history():
    """실적이 3개년 이상이면 진단의 소득은 실적 평균이다."""
    hist = (48_000_000.0, 52_000_000.0, 45_000_000.0)
    d = diagnose(DiagnoseInput("strawberry_hydro", 1300, 30_000_000,
                               income_history=hist))
    assert d["income"]["source"] == "ACTUAL"
    assert d["income"]["annual"] == pytest.approx(sum(hist) / len(hist))


def test_income_level_falls_back_to_crop_average():
    """실적이 모자라면 작목 통계로 추정하고, 그렇다고 밝힌다."""
    d = diagnose(DiagnoseInput("strawberry_hydro", 1300, 30_000_000,
                               income_history=(48_000_000.0, 52_000_000.0)))
    assert d["income"]["source"] == "CROP_AVERAGE"
    assert d["income"]["annual"] == pytest.approx(d["income"]["crop_average"])


def test_diagnosis_and_benchmark_never_contradict():
    """진단이 부르는 '내 소득'과 벤치마크가 부르는 '내 소득'이 같아야 한다.

    이게 어긋나면 한 화면에서 두 개의 서로 다른 '내 소득'이 보인다.
    """
    from engine.benchmark import benchmark

    hist = (48_000_000.0, 52_000_000.0, 45_000_000.0)
    d = diagnose(DiagnoseInput("strawberry_hydro", 1300, 30_000_000,
                               income_history=hist))
    b = benchmark("strawberry_hydro", 1300, hist)
    assert b["comparable"]
    assert d["income"]["annual"] == pytest.approx(b["my_income"])
    assert d["income"]["crop_average"] == pytest.approx(b["average_income"])


def test_underperforming_farm_gets_a_smaller_limit():
    """평균보다 못 버는 농가에게 평균 기준 한도를 권하지 않는다.

    이게 이 수정의 실질이다 — 고치기 전에는 실적 4,833만원인 농가에게
    6,304만원 기준으로 2억 7,069만원을 권하고 있었다.
    """
    low = (35_000_000.0, 33_000_000.0, 37_000_000.0)
    with_actual = diagnose(DiagnoseInput("strawberry_hydro", 1300, 30_000_000,
                                         income_history=low))
    estimated = diagnose(DiagnoseInput("strawberry_hydro", 1300, 30_000_000))
    assert with_actual["income"]["annual"] < estimated["income"]["annual"]
    assert with_actual["limits"]["risk_based"] < estimated["limits"]["risk_based"]


def test_actual_income_scales_with_area():
    """실적은 '그 면적에서 낸 돈'이다. 면적을 물으면 환산해야 한다.

    사고 이력 2026-09-02: 환산이 없을 때 면적을 두 배로 해도 소득이 그대로였고,
    그래서 "면적을 늘리면 된다"는 레버가 통째로 죽었다.
    """
    from dataclasses import replace

    hist = (48_000_000.0, 52_000_000.0, 45_000_000.0)
    base = DiagnoseInput("strawberry_hydro", 1300, 30_000_000, income_history=hist)
    assert base.income_history_pyeong == 1300   # 기준 면적이 못 박힌다

    doubled = diagnose(replace(base, pyeong=2600))
    assert doubled["income"]["annual"] == pytest.approx(
        diagnose(base)["income"]["annual"] * 2)


def test_area_lever_still_works_with_actual_income():
    """실적을 넣어도 면적 레버가 답을 낸다."""
    from engine.levers import solve_for

    inp = DiagnoseInput("strawberry_hydro", 1300, 30_000_000,
                        income_history=(48_000_000.0, 52_000_000.0, 45_000_000.0))
    area = next(l for l in solve_for(inp, 200_000_000) if l.variable == "pyeong")
    assert area.reachable
    assert area.to_value > area.from_value


def test_levers_and_diagnosis_use_the_same_income():
    """레버가 진단과 다른 소득으로 계산하면 화면끼리 답이 어긋난다.

    2026-09-02: levers._crisis_at 이 annual_income 을 직접 불러서, 실적을 넣은
    농가는 진단(4,833만원)과 레버(6,304만원)가 서로 다른 소득으로 돌고 있었다.
    """
    from engine.levers import _crisis_at
    from engine.risk_limit import limit_by_crisis_prob  # noqa: F401  (동일 경로 확인용)

    hist = (35_000_000.0, 33_000_000.0, 37_000_000.0)
    inp = DiagnoseInput("strawberry_hydro", 1300, 20_000_000, income_history=hist)
    d = diagnose(inp)
    # 진단의 권장 차입에서는 위기확률이 기준 이하여야 한다.
    assert _crisis_at(inp, d["limits"]["risk_based"]) <= d["limits"]["max_crisis_prob"] + 0.02
