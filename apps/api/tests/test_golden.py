"""§9 골든 테스트 케이스.

명세의 기대값은 검증된 파라미터로 산출한 기준값이다. 이 파일이 통과하지 않으면
엔진 변경은 되돌린다.
"""
from __future__ import annotations

import numpy as np
import pytest

from engine import (
    TARGET_DSCR,
    annual_income,
    annuity_factor,
    capacity,
    get_crop,
    get_product,
    limit_by_dscr,
    min_area,
    simulate,
)
from engine.diagnose import DiagnoseInput, diagnose

PRODUCT = get_product("successor_farmer")
LIVING = 24_000_000

# 명세 §9 는 'sigma=0.20' 을 공통 파라미터로 못박는다. crops.json 의 σ 는 실측으로
# 갱신되므로(KOSIS), 골든 케이스는 σ 를 명시적으로 고정해 엔진 회귀만 검증한다.
GOLDEN_SIGMA = 0.20

# ── 명세 §9 기대값 정정 (2026-08) ───────────────────────────────────────────
# 명세 §4.1 은 상환기를 '원리금균등'으로 적었으나, 시행지침 원문은 다르다.
#
#   "ㅇ 대출(상환)기간 : 5년 거치 20년 원금 균등분할 상환"
#   — 농림축산식품부 후계농업경영인 선발 및 지원사업 시행지침, p.12
#
# 원금균등은 상환 첫해가 가장 무겁고 매년 줄어든다. 상환액·절벽배수·권장한도·
# 최소면적이 모두 달라진다. **명세가 틀렸고 지침이 맞다.** 소득·여력·거치이자처럼
# 상환방식과 무관한 값은 §9 그대로다.
PEAK_FACTOR = 1 / 20 + 0.015          # 원금 1당 최대 연 상환액 = 0.065


def approx_pct(expected: float, pct: float):
    return pytest.approx(expected, rel=pct)


def run(crop_id: str, pyeong: float, living: float = LIVING, other: float = 0.0):
    return diagnose(
        DiagnoseInput(
            crop_id=crop_id,
            pyeong=pyeong,
            living_cost=living,
            other_debt_service=other,
            requested_principal=PRODUCT.limit,
        ),
        sigma_override=GOLDEN_SIGMA,
    )


# ── 공통 파라미터 확인 ────────────────────────────────────────
def test_product_params():
    assert PRODUCT.limit == 500_000_000
    assert PRODUCT.rate == 0.015
    assert PRODUCT.grace_years == 5
    assert PRODUCT.amort_years == 20


def test_sim_defaults():
    from engine import sim_defaults

    d = sim_defaults()
    assert d["p_disaster"] == 0.08
    assert d["seed"] == 42
    assert d["n_sim"] == 30000
    assert d["target_dscr"] == 1.25


# ── 케이스 A ─────────────────────────────────────────────────
class TestCaseA:
    """딸기(시설,수경) 1,000평 / 생활비 2,400만 / 기존부채 0"""

    d = run("strawberry_hydro", 1000)
    s = d["scenarios"]["at_available"]

    def test_annual_income(self):
        assert self.d["income"]["annual"] == approx_pct(48_500_000, 0.01)

    def test_capacity(self):
        assert self.d["income"]["capacity"] == approx_pct(24_500_000, 0.01)

    def test_recommended_limit(self):
        """최대 상환액 기준 역산 — 평균으로 잡으면 첫해에 기준을 못 지킨다."""
        assert self.d["limits"]["recommended"] == approx_pct(301_490_000, 0.01)

    def test_grace_payment(self):
        assert self.s["grace_payment"] == pytest.approx(7_500_000, abs=1.0)

    def test_amort_payment(self):
        """상환 첫해(가장 무거운 해) 금액. 원리금균등 가정의 2,912만원이 아니다."""
        assert self.s["amort_payment"] == approx_pct(32_500_000, 0.005)

    def test_payment_declines_over_time(self):
        """원금균등의 정체 — 첫해가 최대이고 매년 줄어든다."""
        assert self.s["amort_payment_last"] == approx_pct(25_375_000, 0.005)
        assert self.s["amort_payment_last"] < self.s["amort_payment"]

    def test_cliff_multiple(self):
        assert self.s["cliff_multiple"] == pytest.approx(4.33, abs=0.02)

    def test_dscr_median(self):
        assert self.s["dscr_median"] == pytest.approx(0.77, abs=0.03)

    def test_worst_year_dscr_is_reported(self):
        """중앙값만 보면 최악 구간이 가려진다. 상환 첫해가 25년 중 가장 위험하다."""
        assert self.s["dscr_first_amort"] == pytest.approx(0.69, abs=0.03)
        assert self.s["dscr_first_amort"] < self.s["dscr_median"]

    def test_crisis_prob(self):
        assert self.s["crisis_prob"] == pytest.approx(0.999, abs=0.01)

    def test_first_risk_year(self):
        assert self.s["first_risk_year"] == 6

    def test_min_area(self):
        assert self.d["min_area_pyeong"] == approx_pct(1333, 0.02)

    def test_status(self):
        assert self.d["status"] == "ok"


# ── 케이스 B ─────────────────────────────────────────────────
class TestCaseB:
    """딸기(시설,수경) 2,500평 / 동일 조건 — 한도 상한 적용"""

    d = run("strawberry_hydro", 2500)
    s = d["scenarios"]["at_available"]

    def test_annual_income(self):
        assert self.d["income"]["annual"] == approx_pct(121_240_000, 0.01)

    def test_recommended_is_capped(self):
        assert self.d["limits"]["recommended"] == 500_000_000
        assert self.d["limits"]["gap"] == 0

    def test_dscr_median(self):
        assert self.s["dscr_median"] == pytest.approx(3.17, abs=0.05)

    def test_crisis_prob(self):
        assert self.s["crisis_prob"] == pytest.approx(0.000, abs=0.01)


# ── 케이스 C ─────────────────────────────────────────────────
class TestCaseC:
    """토마토(시설,수경) 2,000평 / 생활비 2,400만 / 기존부채 300만"""

    d = run("tomato_hydro", 2000, other=3_000_000)
    s = d["scenarios"]["at_available"]

    def test_annual_income(self):
        assert self.d["income"]["annual"] == approx_pct(80_330_000, 0.01)

    def test_capacity(self):
        assert self.d["income"]["capacity"] == approx_pct(53_330_000, 0.01)

    def test_dscr_median(self):
        assert self.s["dscr_median"] == pytest.approx(1.72, abs=0.05)

    def test_crisis_prob(self):
        assert self.s["crisis_prob"] == pytest.approx(0.031, abs=0.01)


# ── 케이스 D ─────────────────────────────────────────────────
class TestCaseD:
    """시금치(시설) 3,000평 / 생활비 2,400만 — 상환여력 없음"""

    d = run("spinach", 3000)

    def test_annual_income(self):
        assert self.d["income"]["annual"] == approx_pct(17_160_000, 0.01)

    def test_no_capacity(self):
        assert self.d["income"]["capacity"] < 0
        assert self.d["status"] == "no_capacity"
        assert self.d["scenarios"] == {}

    def test_min_area(self):
        # 원금균등 기준 재산출 (§9 의 10,562평은 원리금균등 가정)
        assert self.d["min_area_pyeong"] == approx_pct(11_300, 0.02)


# ── 불변식 ───────────────────────────────────────────────────
def test_invariant_recommended_meets_target():
    """1. 권장 한도로 차입 시 **가장 무거운 해에도** 목표 DSCR 이상"""
    for crop_id, pyeong, other in [
        ("strawberry_hydro", 1000, 0),
        ("tomato_hydro", 2000, 3_000_000),
        ("eggplant", 1500, 0),
        ("rose", 900, 1_000_000),
    ]:
        d = run(crop_id, pyeong, other=other)
        rec = d["limits"]["recommended"]
        cap = d["income"]["capacity"]
        assert cap / (rec * PEAK_FACTOR) >= TARGET_DSCR - 1e-9


def test_invariant_limit_monotonic_in_area():
    """2. 면적 증가 → 권장 한도 단조 증가"""
    prev = -1.0
    for pyeong in range(400, 2600, 100):
        rec = run("strawberry_hydro", pyeong)["limits"]["recommended"]
        assert rec >= prev - 1e-9
        prev = rec


def test_invariant_sigma_does_not_move_deterministic_values():
    """3. sigma 변화가 결정론적 값(원리금·최소면적)에 영향 없음"""
    income = annual_income("strawberry_hydro", 1000)
    cap = capacity(income, LIVING, 0)
    base_limit = limit_by_dscr(cap, PRODUCT)
    base_area = min_area("strawberry_hydro", PRODUCT.limit, LIVING, 0, PRODUCT)

    results = [
        simulate(PRODUCT.limit, income, LIVING, sigma=s, product=PRODUCT)
        for s in (0.10, 0.20, 0.30)
    ]
    for r in results:
        assert r.amort_payment == pytest.approx(results[0].amort_payment)
        assert r.grace_payment == pytest.approx(results[0].grace_payment)
    assert base_limit == limit_by_dscr(cap, PRODUCT)
    assert base_area == min_area("strawberry_hydro", PRODUCT.limit, LIVING, 0, PRODUCT)


def test_invariant_seed_reproducibility():
    """4. seed 고정 시 재현성"""
    income = annual_income("strawberry_hydro", 1000)
    a = simulate(PRODUCT.limit, income, LIVING, sigma=0.2, product=PRODUCT)
    b = simulate(PRODUCT.limit, income, LIVING, sigma=0.2, product=PRODUCT)
    assert a == b
    c = simulate(PRODUCT.limit, income, LIVING, sigma=0.2, product=PRODUCT, seed=7)
    assert c.dscr_median != a.dscr_median


def test_invariant_diagnosis_id_roundtrip():
    inp = DiagnoseInput("strawberry_hydro", 1000, 24_000_000, 0, 500_000_000)
    assert DiagnoseInput.decode(inp.encode()) == inp


def test_schedule_shape():
    """거치기간은 평평하고, 상환기는 원금균등이라 매년 계단식으로 낮아진다."""
    d = run("strawberry_hydro", 1000)
    sched = d["schedule"]
    g = PRODUCT.grace_years
    assert len(sched) == g + PRODUCT.amort_years
    assert all(np.isclose(x, 7_500_000) for x in sched[:g])
    amort = sched[g:]
    assert amort == sorted(amort, reverse=True)          # 단조 감소
    assert amort[0] > amort[-1]                          # 평평하지 않다
    # 원금 몫은 매년 같고, 줄어드는 것은 이자분이다
    steps = {round(a - b) for a, b in zip(amort, amort[1:])}
    assert len(steps) == 1


def test_higher_principal_is_never_safer():
    income = annual_income("strawberry_hydro", 1200)
    lo = simulate(200_000_000, income, LIVING, sigma=0.2, product=PRODUCT)
    hi = simulate(400_000_000, income, LIVING, sigma=0.2, product=PRODUCT)
    assert hi.dscr_median < lo.dscr_median
    assert hi.crisis_prob >= lo.crisis_prob
