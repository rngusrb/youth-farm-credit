"""tests/test_tools.py — 도구 카탈로그(engine/tools.py) 계약 검사

## 이 파일이 지키는 것

`ToolSpec.returns` 는 "이 도구가 만든 수치가 결과 어디에 있는지"를 선언한 **좌표**다.
Verifier 가 이 좌표로 문장 속 숫자를 대조하므로, 좌표가 하나라도 실제와 어긋나면
검증 전체가 조용히 무력해진다 — 대조할 값을 못 찾으니 통과시켜 버린다.

그래서 **선언한 좌표가 실제 출력에 존재하는지**를 기계가 검사한다. 이게 없으면
엔진 출력 구조가 바뀌었을 때 아무도 모른다.
"""
import pytest

from engine.diagnose import DiagnoseInput
from engine.errors import InsufficientCropData
from engine.tools import ENGINE_TOOLS, pick

BASE = {"crop_id": "strawberry_hydro", "pyeong": 1300.0, "living_cost": 30_000_000.0,
        "other_debt_service": 5_000_000.0}

ARGS = {
    "get_crop": {"crop_id": "strawberry_hydro"},
    "diagnose": BASE,
    "cashflow": {**BASE, "principal": 200_000_000.0},
    "stress": {**BASE, "principal": 200_000_000.0},
    "solve_for": {**BASE, "target_principal": 280_000_000.0},
    "switch_crop": {"crop_id": "strawberry_hydro", "pyeong": 1300.0},
    "funding_map": {**BASE, "principal": 200_000_000.0},
    "benchmark": {"crop_id": "strawberry_hydro", "pyeong": 1300.0,
                  "actual_income": [48_000_000.0, 52_000_000.0, 45_000_000.0]},
}


def test_every_tool_has_test_args():
    """도구를 추가하면 여기 인자도 추가해야 한다 — 안 그러면 좌표 검사를 안 받는다.

    2026-09-02 switch_crop·funding_map·benchmark 를 추가하자 fixture 가 KeyError 로
    죽으며 곧바로 잡혔다. 그 실패 방식에 기대지 않고 이유를 말해 주는 검사로 둔다.
    """
    missing = sorted(set(ENGINE_TOOLS) - set(ARGS))
    assert not missing, f"tests/test_tools.py 의 ARGS 에 인자가 없는 도구: {missing}"


@pytest.fixture(scope="module")
def outputs() -> dict[str, dict]:
    return {name: spec.fn(**ARGS[name]) for name, spec in ENGINE_TOOLS.items()}


# ── 계약 무결성 — 이 테스트가 이 파일의 존재 이유다 ────────────────────────

@pytest.mark.parametrize("name", sorted(ENGINE_TOOLS))
def test_declared_refs_exist_in_real_output(name, outputs):
    """선언한 좌표가 실제 출력에 전부 있어야 한다.

    하나라도 없으면 Verifier 가 그 수치를 대조하지 못하고 **조용히 통과시킨다.**
    """
    spec, result = ENGINE_TOOLS[name], outputs[name]
    missing = []
    for ref in spec.returns:
        try:
            pick(result, ref)
        except KeyError:
            missing.append(ref)
    assert not missing, f"{name}: 선언했지만 출력에 없는 좌표 {missing}"


@pytest.mark.parametrize("name", sorted(ENGINE_TOOLS))
def test_declared_refs_are_numeric(name, outputs):
    """좌표가 가리키는 값은 대조 가능한 수치여야 한다 (None 허용 — 데이터 미보유)."""
    spec, result = ENGINE_TOOLS[name], outputs[name]
    for ref in spec.returns:
        v = pick(result, ref)
        assert v is None or isinstance(v, (int, float)), f"{name}.{ref} = {type(v)}"


@pytest.mark.parametrize("name", sorted(ENGINE_TOOLS))
def test_every_tool_declares_something(name):
    spec = ENGINE_TOOLS[name]
    assert spec.fn is not None
    assert spec.summary.strip()
    assert spec.required, f"{name}: 필수 인자가 하나도 없다 — 되묻기가 동작하지 않는다"


# ── 되묻기 대상 판정 ──────────────────────────────────────────────────────

def test_missing_lists_absent_required_args():
    spec = ENGINE_TOOLS["diagnose"]
    assert spec.missing({"crop_id": "strawberry_hydro"}) == ("pyeong", "living_cost")
    assert spec.missing(BASE) == ()


def test_missing_treats_empty_string_as_absent():
    assert "crop_id" in ENGINE_TOOLS["get_crop"].missing({"crop_id": ""})


# ── pick — 좌표 해석 ──────────────────────────────────────────────────────

def test_pick_nested_and_missing():
    assert pick({"a": {"b": 7}}, "a.b") == 7
    with pytest.raises(KeyError):
        pick({"a": {"b": 7}}, "a.c")
    with pytest.raises(KeyError):
        pick({"a": 1}, "a.b")          # 스칼라를 더 파고들 수 없다


def test_pick_indexes_lists():
    assert pick({"xs": [{"v": 3}]}, "xs.0.v") == 3


# ── 실패는 도메인 예외로 (core 는 HTTP 를 모른다) ──────────────────────────

def test_unknown_crop_raises_keyerror():
    with pytest.raises(KeyError):
        ENGINE_TOOLS["diagnose"].fn(**{**BASE, "crop_id": "does_not_exist"})


def test_missing_crop_data_raises_domain_error():
    """총수입·경영비가 없는 작목은 지어내지 않고 실패한다."""
    from engine.params import crops

    bare = [c for c in crops().values() if not (c.gross_per_10a and c.cost_per_10a)]
    if not bare:
        pytest.skip("모든 작목에 총수입·경영비가 있다")
    with pytest.raises(InsufficientCropData):
        ENGINE_TOOLS["cashflow"].fn(**{**BASE, "crop_id": bare[0].id,
                                       "principal": 100_000_000.0})


# ── 도구가 엔드포인트와 같은 값을 낸다 (두 벌 방지) ────────────────────────

def test_tool_matches_endpoint_assembly():
    """도구와 API 엔드포인트가 같은 core 함수를 쓰는지 값으로 확인한다."""
    from engine.cashflow import cashflow_for

    inp = DiagnoseInput(crop_id=BASE["crop_id"], pyeong=BASE["pyeong"],
                        living_cost=BASE["living_cost"],
                        other_debt_service=BASE["other_debt_service"])
    direct = cashflow_for(inp, 200_000_000.0, 1)
    via_tool = ENGINE_TOOLS["cashflow"].fn(**ARGS["cashflow"])
    assert direct["trough_month"] == via_tool["trough_month"]
    assert direct["working_capital_need"] == via_tool["working_capital_need"]
