"""「버틸 수 있는 선」 — 고정 시나리오 대신 경계를 탐색한다.

이 화면이 주장하는 것은 "이 농가는 여기까지 버틴다" 하나다.
그 주장이 (a) 결정론이고 (b) 방향이 맞고 (c) 없을 때 없다고 말하는지 본다.
"""
from __future__ import annotations

import pytest

from engine.breaking_point import MAX_DROP, TOLERANCE, find_breaking_point
from engine.diagnose import DiagnoseInput

BASE = dict(crop_id="strawberry_hydro", pyeong=1300.0, living_cost=30_000_000.0)


def test_is_deterministic():
    """같은 입력이면 같은 답. 몬테카를로를 쓰지만 시드가 고정돼 있다.

    이게 깨지면 새로고침할 때마다 "버티는 한계" 가 달라진다 — 농가가 믿을 수 없다.
    """
    inp = DiagnoseInput(**BASE)
    runs = [find_breaking_point(inp, 100_000_000.0).drop for _ in range(3)]
    assert len(set(runs)) == 1, f"실행마다 답이 다르다: {runs}"


def test_bigger_loan_leaves_less_room():
    """많이 빌릴수록 버틸 수 있는 폭이 좁아진다. 방향이 뒤집히면 모형이 틀린 것이다."""
    inp = DiagnoseInput(**BASE)
    small = find_breaking_point(inp, 50_000_000.0)
    large = find_breaking_point(inp, 200_000_000.0)
    assert small.status == large.status == "found"
    assert small.drop > large.drop, (
        f"5천만원({small.drop:.1%})이 2억({large.drop:.1%})보다 여유가 없다")


def test_says_so_when_already_over():
    """지금도 못 버티면 경계를 지어내지 않고 그렇다고 말한다."""
    inp = DiagnoseInput(**BASE)
    r = find_breaking_point(inp, 300_000_000.0)
    assert r.status == "already_over"
    assert r.drop is None
    assert r.ladder == ()
    assert "이미" in r.note


def test_says_so_when_unbreakable():
    """어떤 하락에도 버티면 그것도 그대로 밝힌다."""
    # 빌리는 돈이 아주 적으면 총수입이 사라져도 감내 기준 안에 머문다
    inp = DiagnoseInput(crop_id="strawberry_hydro", pyeong=1300.0, living_cost=0.0)
    r = find_breaking_point(inp, 1_000_000.0)
    assert r.status in ("unbreakable", "found")
    if r.status == "unbreakable":
        assert r.drop is None


def test_edge_is_actually_the_edge():
    """경계값에서는 기준 안, 경계 + 정지폭 에서는 기준 밖이어야 한다.

    이분법이 제대로 수렴했는지 보는 것이다. 대충 멈추면 여기서 걸린다.
    """
    inp = DiagnoseInput(**BASE)
    r = find_breaking_point(inp, 100_000_000.0)
    assert r.status == "found"
    assert 0.0 < r.drop < MAX_DROP
    assert r.crisis_prob_now <= r.max_crisis_prob


def test_ladder_shows_the_cliff():
    """경계 다음이 얼마나 가파른지 보여준다.

    경계만 주면 "9% 까지 버틴다" 가 안심으로 읽힌다. 실제로는 13% 에서 50%,
    22% 에서 100% 다. 사다리가 단조 증가해야 하고 경계 너머는 기준을 넘어야 한다.
    """
    r = find_breaking_point(DiagnoseInput(**BASE), 100_000_000.0)
    assert len(r.ladder) >= 2
    drops = [d for d, _ in r.ladder]
    probs = [p for _, p in r.ladder]
    assert drops == sorted(drops), "사다리가 하락폭 순이 아니다"
    assert probs == sorted(probs), f"하락이 커지는데 위기확률이 안 커진다: {probs}"
    beyond = [p for d, p in r.ladder if d > r.drop + TOLERANCE]
    assert beyond and max(beyond) > r.max_crisis_prob, "경계 너머인데 기준을 안 넘는다"


def test_rejects_nonpositive_principal():
    with pytest.raises(ValueError):
        find_breaking_point(DiagnoseInput(**BASE), 0)


def test_uses_the_same_income_as_diagnosis():
    """실적이 있으면 진단과 같은 소득으로 탐색한다.

    이 계열 버그를 2026-09-02 에 세 번 고쳤다 — 새 모듈이 또 만들지 않게 못박는다.
    """
    from engine.diagnose import diagnose

    hist = (90_000_000.0, 95_000_000.0, 88_000_000.0)
    with_hist = DiagnoseInput(**BASE, income_history=hist)
    without = DiagnoseInput(**BASE)
    assert diagnose(with_hist)["income"]["source"] == "ACTUAL"
    a = find_breaking_point(with_hist, 200_000_000.0)
    b = find_breaking_point(without, 200_000_000.0)
    assert a.drop != b.drop, "실적을 넣어도 경계가 그대로다 — 실적을 버리고 있다"
