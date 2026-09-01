"""tests/test_agent.py — Planner 와 오케스트레이션 계약

## 실제 모델을 부르지 않는다

Planner 는 같은 질문에 매번 다른 계획을 낼 수 있다. 그걸로 계약을 재면 회귀인지
운인지 구분할 수 없고 매 실행 과금된다(질의확장에서 이미 겪었다 — `rag/_GUIDE.md`).
여기서는 **가짜 응답**으로 "나쁜 계획이 걸러지는가"만 본다.
"""
import json

import pytest

from engine.tools import ENGINE_TOOLS
from llm import planner as P

SLOTS = {"crop_id": "strawberry_hydro", "pyeong": 1300.0, "living_cost": 30_000_000.0}


def _client(payload) -> object:
    """지정한 텍스트를 내는 가짜 Anthropic 클라이언트."""
    text = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)

    class _Msg:
        content = [type("B", (), {"type": "text", "text": text})()]

    class _Fake:
        class messages:
            @staticmethod
            def create(**_):
                return _Msg()

    return _Fake()


# ── 카탈로그 ──────────────────────────────────────────────────────────────

def test_catalog_includes_engine_and_rag():
    c = P.catalog()
    assert set(ENGINE_TOOLS) <= set(c)
    assert "search_regulation" in c, "제도 검색이 빠지면 Planner 가 존재를 모른다"


# ── 계획 검증 — LLM 출력을 믿지 않는다 ────────────────────────────────────

def test_unknown_tool_is_dropped_and_reported():
    """모르는 도구는 버리되 **조용히 버리지 않는다**."""
    plan = P.validate({"steps": [{"tool": "predict_default", "args": {}},
                                 {"tool": "diagnose", "args": SLOTS}]}, SLOTS)
    assert [s.tool for s in plan.steps] == ["diagnose"]
    assert any("predict_default" in w for w in plan.warnings)


def test_unknown_arg_is_dropped_and_reported():
    plan = P.validate({"steps": [{"tool": "diagnose", "args": {**SLOTS, "credit_score": 820}}]},
                      SLOTS)
    assert plan.steps and "credit_score" not in plan.steps[0].args
    assert any("credit_score" in w for w in plan.warnings)


def test_missing_required_becomes_ask_not_guess():
    """필수 인자가 없으면 지어내지 않고 되묻는다."""
    plan = P.validate({"steps": [{"tool": "diagnose", "args": {"crop_id": "strawberry_hydro"}}]},
                      {})
    assert plan.steps == []
    assert "pyeong" in plan.ask and "living_cost" in plan.ask


def test_slots_fill_missing_args():
    plan = P.validate({"steps": [{"tool": "diagnose", "args": {}}]}, SLOTS)
    assert plan.steps and plan.steps[0].args["pyeong"] == 1300.0


def test_steps_are_capped():
    many = [{"tool": "diagnose", "args": SLOTS} for _ in range(20)]
    plan = P.validate({"steps": many}, SLOTS)
    assert len(plan.steps) <= P.MAX_STEPS
    assert any("자름" in w for w in plan.warnings)


def test_malformed_step_does_not_crash():
    plan = P.validate({"steps": ["diagnose", None, 42]}, SLOTS)
    assert plan.steps == []
    assert len(plan.warnings) == 3


# ── 폴백 — 키 없이도 상담이 된다 ──────────────────────────────────────────

def test_fallback_used_when_no_client(monkeypatch):
    monkeypatch.setattr(P, "get_client", lambda: None)
    plan = P.plan("재해가 나면 상환을 미룰 수 있나요?", SLOTS)
    assert plan.method == "fallback"
    assert [s.tool for s in plan.steps] == ["search_regulation"]


def test_fallback_adds_solve_for_when_amount_mentioned(monkeypatch):
    monkeypatch.setattr(P, "get_client", lambda: None)
    plan = P.plan("3억 빌려도 되나요?", SLOTS)
    tools = [s.tool for s in plan.steps]
    assert "diagnose" in tools and "solve_for" in tools
    step = next(s for s in plan.steps if s.tool == "solve_for")
    assert step.args["target_principal"] == 300_000_000


@pytest.mark.parametrize("text,expected", [
    ("3억", 300_000_000), ("2,500만원", 25_000_000), ("1.5억원", 150_000_000),
])
def test_money_parsing(text, expected):
    assert P._parse_money(f"{text} 빌리고 싶어요") == expected


def test_invalid_json_falls_back(monkeypatch):
    """JSON 이 아니면 재시도하고, 그래도 안 되면 폴백한다."""
    monkeypatch.setattr(P, "get_client", lambda: _client("계획을 세워보겠습니다!"))
    plan = P.plan("3억 빌려도 되나요?", SLOTS)
    assert plan.method == "fallback"
    assert any("폴백" in w for w in plan.warnings)
    assert plan.llm_calls == P.MAX_PLAN_CALLS, "재시도 상한을 지켜야 한다"


def test_json_with_surrounding_prose_is_parsed(monkeypatch):
    payload = '설명입니다 {"ask": [], "steps": [{"tool": "diagnose", "args": {}}], "reason": "x"} 끝'
    monkeypatch.setattr(P, "get_client", lambda: _client(payload))
    plan = P.plan("얼마까지 빌릴 수 있어요?", SLOTS)
    assert plan.method == "llm" and [s.tool for s in plan.steps] == ["diagnose"]


# ── 오케스트레이션 ────────────────────────────────────────────────────────

def test_consult_asks_when_slots_missing(monkeypatch):
    monkeypatch.setattr(P, "get_client", lambda: None)
    import agent

    a = agent.consult("얼마까지 빌릴 수 있어요?", {})
    assert a.kind == "ask"
    assert a.question and a.missing


def test_consult_respects_tool_budget(monkeypatch):
    """도구 예산을 넘으면 중단하되 에러가 아니라 지금까지 결과로 답한다."""
    import agent

    payload = {"ask": [], "steps": [{"tool": "diagnose", "args": SLOTS}] * 10, "reason": ""}
    monkeypatch.setattr(P, "get_client", lambda: _client(payload))
    monkeypatch.setattr(agent, "MAX_TOOL_CALLS", 2)
    a = agent.consult("얼마까지 빌릴 수 있어요?", SLOTS)
    assert a.kind == "answer"
    assert a.budget.tool_calls <= 2
    assert any(t.error == "도구 실행 예산 초과" for t in a.trace)


def test_consult_records_failed_tool_without_dying(monkeypatch):
    """도구가 실패해도 루프가 죽지 않고 흔적에 남는다."""
    import agent

    payload = {"ask": [], "steps": [{"tool": "diagnose", "args": {**SLOTS, "crop_id": "nope"}}],
               "reason": ""}
    monkeypatch.setattr(P, "get_client", lambda: _client(payload))
    a = agent.consult("얼마까지?", {**SLOTS, "crop_id": "nope"})
    failed = [t for t in a.trace if not t.ok]
    assert failed and failed[0].error
