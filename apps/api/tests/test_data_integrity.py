"""데이터 파일 정합성 — 실측 σ 가 제자리에 들어와 있는지."""
from __future__ import annotations

import math

import pytest

from engine.params import crops, idiosyncratic_sigma


def test_every_crop_has_measured_sigma():
    """KOSIS 캘리브레이션이 전 작목에 적용돼 있어야 한다."""
    for crop in crops().values():
        assert crop.sigma_source == "MEASURED", f"{crop.id} 가 아직 가정값"
        assert crop.sigma_common is not None
        assert crop.sigma_reference and "KOSIS" in crop.sigma_reference


def test_sigma_is_common_and_idiosyncratic_combined():
    """σ = √(σ_공통² + σ_고유²) 가 실제로 성립해야 한다."""
    idio = idiosyncratic_sigma()
    for crop in crops().values():
        assert crop.sigma == pytest.approx(math.hypot(crop.sigma_common, idio), abs=5e-4)


def test_sigma_never_falls_below_the_measured_common_part():
    """실측 공통 성분보다 작은 σ 를 쓰면 위험을 과소평가한다."""
    for crop in crops().values():
        assert crop.sigma > crop.sigma_common


def test_confidence_interval_brackets_the_point_estimate():
    for crop in crops().values():
        lo, hi = crop.sigma_ci
        assert lo < crop.sigma < hi


def test_measured_sigma_differs_across_crops():
    """전 작목 동일 가정(0.20)을 벗어났는지 — 이 계산의 존재 이유.

    계층 축소를 거치면 원추정치의 2.6배 격차가 1.5배로 좁아진다. 관측 11년으로는
    작목 차이의 42%만 실제 신호이기 때문이며, 그게 정직한 폭이다.
    """
    values = {round(c.sigma_common, 3) for c in crops().values()}
    assert len(values) > 3
    assert 1.3 < max(values) / min(values) < 2.2


def test_sigma_went_through_hierarchical_pooling():
    for crop in crops().values():
        assert "pooled" in (crop.sigma_method or "")
        assert "축소" in (crop.sigma_reference or "")


def test_every_crop_has_a_factor_decomposition():
    """소득 변동의 원인(가격/수량/비용)이 작목마다 기록돼 있어야 한다."""
    import json

    from engine.params import DATA_DIR

    data = json.loads((DATA_DIR / "crops.json").read_text(encoding="utf-8"))
    for c in data["crops"]:
        f = c.get("factors")
        assert f, f"{c['id']} 요인분해 없음"
        assert f["driver"] in ("price", "quantity", "cost")
        total = f["share_price"] + f["share_quantity"] + f["share_cost"] + f["residual"]
        assert total == pytest.approx(1.0, abs=0.02), (c["id"], total)


def test_elasticity_is_measured_not_assumed():
    """가격→소득 환산 계수가 실측으로 교체됐는지."""
    from engine.params import policy
    from stats.volatility import DEFAULT_QUANTITY_ELASTICITY

    entry = policy()["price_quantity_elasticity"]
    assert entry["source"] == "MEASURED"
    assert DEFAULT_QUANTITY_ELASTICITY == entry["median"]
    # 예전 가정(-0.5)보다 훨씬 약한 상쇄였다 = 소득 변동을 과소평가하고 있었다
    assert -0.35 < entry["median"] < 0


def test_spinach_is_more_volatile_than_strawberry():
    """저수익 엽채류가 과채류보다 변동이 크다는 실측 결과."""
    assert crops()["spinach"].sigma_common > crops()["strawberry_hydro"].sigma_common


def test_income_matches_the_survey_the_sigma_came_from():
    """income_per_10a 와 σ 가 같은 통계(농산물소득조사)에서 왔는지 대조.
    딸기(수경) 2023 소득 14,669,148 ≈ crops.json 14,670,000."""
    assert crops()["strawberry_hydro"].income_per_10a == pytest.approx(
        14_669_148, rel=0.001
    )
