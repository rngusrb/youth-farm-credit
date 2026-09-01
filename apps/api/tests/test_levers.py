"""tests/test_levers.py — 반사실 탐색(engine/levers.py)

이 모듈은 "3억을 받으려면 무엇이 얼마나 달라져야 하나"를 답한다.
LLM 이 아니라 엔진이 이분탐색으로 찾으므로 **같은 입력에 같은 답**이어야 한다.
그 성질이 이 기능의 존재 이유라서 결정성 테스트를 실검출로 둔다.
"""
import pytest

from engine.diagnose import DiagnoseInput, diagnose
from engine.levers import DEFAULT_BOUNDS, solve_for


def _inp(pyeong=1300.0, living=30_000_000.0, debt=5_000_000.0) -> DiagnoseInput:
    return DiagnoseInput(crop_id="strawberry_hydro", pyeong=pyeong,
                         living_cost=living, other_debt_service=debt)


# ── 결정성 — 이 기능의 전제 ────────────────────────────────────────────────

def test_deterministic_across_runs():
    """같은 입력 5회 → 완전히 같은 결과. 흔들리면 조언으로 쓸 수 없다."""
    inp = _inp()
    runs = [tuple((l.variable, l.to_value, l.reachable) for l in solve_for(inp, 280_000_000))
            for _ in range(5)]
    assert len(set(runs)) == 1


# ── 달성 가능/불가 ────────────────────────────────────────────────────────

def test_reachable_lever_lowers_crisis_prob():
    """달성 가능하다고 한 레버는 실제로 위험확률을 목표 아래로 내린다."""
    inp = _inp()
    levers = [l for l in solve_for(inp, 280_000_000) if l.reachable]
    assert levers, "적어도 하나는 달성 가능해야 하는 사례"
    for l in levers:
        assert l.crisis_prob_after is not None
        assert l.crisis_prob_after <= l.crisis_prob_before
        assert l.to_value is not None


def test_unreachable_is_not_faked():
    """범위 안에서 못 닿으면 to_value 를 지어내지 않고 None 으로 둔다."""
    inp = _inp(pyeong=900.0)
    levers = solve_for(inp, 250_000_000)
    unreachable = [l for l in levers if not l.reachable]
    assert unreachable, "이 사례에는 달성 불가 레버가 있어야 한다"
    for l in unreachable:
        assert l.to_value is None
        assert l.delta_ratio is None


def test_already_sufficient_needs_no_change():
    """권장 한도 이하 금액이면 아무것도 안 움직여도 된다."""
    inp = _inp()
    safe = diagnose(inp)["limits"]["risk_based"]
    if safe <= 0:
        pytest.skip("이 입력은 권장 한도가 0이라 대상이 아니다")
    levers = solve_for(inp, safe * 0.8)
    moved = [l for l in levers if l.reachable and abs(l.to_value - l.from_value) > 1.0]
    assert not moved, f"움직일 필요가 없는데 움직이라고 했다: {moved}"


# ── 방향 ──────────────────────────────────────────────────────────────────

def test_direction_is_sane():
    """생활비·부채는 줄이는 쪽, 면적은 늘리는 쪽으로만 제안한다."""
    for l in solve_for(_inp(), 280_000_000):
        if not l.reachable:
            continue
        if l.variable in ("living_cost", "other_debt_service"):
            assert l.to_value <= l.from_value + 1.0
        if l.variable == "pyeong":
            assert l.to_value >= l.from_value - 1.0


# ── 탐색 범위를 숨기지 않는다 ──────────────────────────────────────────────

def test_searched_range_is_reported():
    """커트라인이 조용히 숨으면 안 된다 — 실제 탐색 범위를 결과에 싣는다."""
    inp = _inp()
    for l in solve_for(inp, 280_000_000):
        assert l.searched_from <= l.searched_to
        lo_r, hi_r = DEFAULT_BOUNDS[l.variable]
        base = {"living_cost": inp.living_cost,
                "other_debt_service": inp.other_debt_service,
                "pyeong": inp.pyeong}[l.variable]
        assert l.searched_from == pytest.approx(base * lo_r)
        assert l.searched_to == pytest.approx(base * hi_r)


def test_result_stays_inside_searched_range():
    for l in solve_for(_inp(), 280_000_000):
        if l.reachable:
            assert l.searched_from - 1 <= l.to_value <= l.searched_to + 1


def test_custom_bounds_widen_reach():
    """범위를 넓히면 달성 가능해질 수 있다 — 범위가 호출자 손에 있다는 확인."""
    inp = _inp(pyeong=900.0)
    narrow = {l.variable: l for l in solve_for(inp, 250_000_000)}
    wide = {l.variable: l for l in solve_for(inp, 250_000_000,
                                             bounds={"living_cost": (0.10, 1.00)})}
    assert narrow["living_cost"].reachable is False
    assert wide["living_cost"].reachable is True


# ── 입력 검증 ─────────────────────────────────────────────────────────────

def test_zero_debt_cannot_be_reduced():
    """이미 0인 항목을 줄이라고 하지 않는다."""
    levers = {l.variable: l for l in solve_for(_inp(debt=0.0), 280_000_000)}
    d = levers["other_debt_service"]
    assert d.reachable is False and "0" in d.note


def test_rejects_nonpositive_target():
    with pytest.raises(ValueError):
        solve_for(_inp(), 0)


def test_rejects_unknown_variable():
    with pytest.raises(ValueError):
        solve_for(_inp(), 280_000_000, movables=("interest_rate",))


def test_only_requested_movables_returned():
    """움직일 수 없다고 한 변수는 제안하지 않는다."""
    levers = solve_for(_inp(), 280_000_000, movables=("living_cost",))
    assert [l.variable for l in levers] == ["living_cost"]
