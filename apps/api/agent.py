"""agent.py — 상담 오케스트레이션 (api 레이어).

Planner 가 고른 도구를 실행하고, 결과를 설명으로 바꾸고, 검증까지 태워서 돌려준다.

## 왜 api 레이어인가

core(engine) 는 프롬프트를 몰라야 하고, adapters(llm) 는 도구를 실행하지 않는다.
**둘을 잇는 자리**가 여기다 — `boundaries.yaml` 의 api 레이어에 이 파일을 선언해 뒀다.

## 예산을 코드에 박는다

에이전트 루프는 방치하면 왕복이 늘어난다. 상한을 상수로 두고 넘으면 **중단하되
지금까지 결과로 답한다** — 에러로 만들지 않는다. 사용자에게는 "더 물어보시면
이어서 계산할게요"가 낫다.
"""
from __future__ import annotations

import logging
import time
from dataclasses import asdict, dataclass, field
from typing import Any

from engine.errors import InsufficientCropData
from llm.planner import catalog
from llm import planner as planner_mod
from llm.narrate import narrate
from llm.verify import verify_text
from rag.answer import ask as regulation_ask

log = logging.getLogger(__name__)

MAX_TOOL_CALLS = 6
MAX_LLM_CALLS = 4


@dataclass
class Budget:
    llm_calls: int = 0
    tool_calls: int = 0

    def llm_left(self) -> int:
        return MAX_LLM_CALLS - self.llm_calls

    def tool_left(self) -> int:
        return MAX_TOOL_CALLS - self.tool_calls


@dataclass
class TraceEntry:
    tool: str
    args: dict
    ms: int
    ok: bool
    error: str | None = None


@dataclass
class Answer:
    kind: str                                   # "answer" | "ask"
    text: str = ""
    missing: list[str] = field(default_factory=list)
    question: str = ""
    citations: list[dict] = field(default_factory=list)
    numbers_used: list[float] = field(default_factory=list)
    dropped: list[str] = field(default_factory=list)
    trace: list[TraceEntry] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    budget: Budget = field(default_factory=Budget)
    method: str = "llm"
    #: 도구 이름 → 결과. 화면이 숫자 카드를 그릴 때 쓴다.
    #: 설명 문장이 아니라 **이 값**이 근거다 — 화면은 여기서만 숫자를 읽는다.
    results: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["budget"] = asdict(self.budget)
        d["trace"] = [asdict(t) for t in self.trace]
        return d


ASK_LABELS = {
    "crop_id": "어떤 작목을 하고 계세요?",
    "pyeong": "재배 면적이 어떻게 되세요? (평)",
    "living_cost": "연 생활비는 대략 얼마나 되세요?",
    "target_principal": "얼마를 빌리려고 하세요?",
    "principal": "얼마를 기준으로 볼까요?",
}


def _run_tool(name: str, args: dict, question: str) -> tuple[Any, TraceEntry]:
    """도구 하나를 실행한다. 실패해도 루프를 죽이지 않고 흔적에 남긴다."""
    t0 = time.perf_counter()
    try:
        spec = catalog()[name]
        result = spec.fn(**args)
        ms = int((time.perf_counter() - t0) * 1000)
        return result, TraceEntry(name, args, ms, ok=True)
    except (KeyError, InsufficientCropData, ValueError) as exc:
        ms = int((time.perf_counter() - t0) * 1000)
        log.warning("도구 %s 실패: %s", name, exc)
        return None, TraceEntry(name, args, ms, ok=False, error=str(exc))


def consult(question: str, slots: dict | None = None, persona: str = "farmer") -> Answer:
    """질문 하나를 처리한다: 계획 → 실행 → 설명 → 검증."""
    slots = slots or {}
    budget = Budget()

    p = planner_mod.plan(question, slots)
    budget.llm_calls += p.llm_calls

    if p.ask:
        first = p.ask[0]
        return Answer(
            kind="ask", missing=p.ask,
            question=ASK_LABELS.get(first, f"{first} 값이 필요해요"),
            warnings=p.warnings, budget=budget, method=p.method,
        )

    results: dict[str, Any] = {}
    trace: list[TraceEntry] = []
    citations: list[dict] = []

    for step in p.steps:
        if budget.tool_left() <= 0:
            trace.append(TraceEntry("(중단)", {}, 0, ok=False, error="도구 실행 예산 초과"))
            break
        result, entry = _run_tool(step.tool, step.args, question)
        budget.tool_calls += 1
        trace.append(entry)
        if result is None:
            continue
        results[step.tool] = result
        if step.tool == "search_regulation":
            citations.extend(result.get("citations", []))

    if not results:
        return Answer(kind="answer", text="계산에 필요한 정보를 얻지 못했어요.",
                      trace=trace, warnings=p.warnings, budget=budget, method=p.method)

    # 제도 질문만 한 경우 — 검색 답변을 그대로 쓴다 (인용이 이미 강제돼 있다)
    if set(results) == {"search_regulation"}:
        r = results["search_regulation"]
        return Answer(kind="answer", text=r.get("answer", ""), citations=citations,
                      trace=trace, warnings=p.warnings, budget=budget, method=p.method,
                      results=results)

    diagnosis = results.get("diagnose")
    text, dropped, used = "", [], []
    if diagnosis is not None and budget.llm_left() > 0:
        n = narrate(diagnosis, persona=persona) if _narrate_takes_persona() else narrate(diagnosis)
        budget.llm_calls += 1
        raw = n if isinstance(n, str) else n.get("body", "")
        # 허용 수치는 **쓴 도구 전부**에서 모은다. diagnosis 만 넘기면 stress·funding_map 이
        # 낸 값을 인용한 문장이 통째로 잘린다 — advisor 에서 같은 버그를 이미 겪었다 (2026-09-01).
        text, dropped, used = verify_text(raw, results)
    elif diagnosis is not None:
        text = "설명 예산을 다 써서 계산 결과만 보여드려요."

    return Answer(kind="answer", text=text, citations=citations, numbers_used=used,
                  dropped=dropped, trace=trace, warnings=p.warnings,
                  budget=budget, method=p.method, results=results)


def _narrate_takes_persona() -> bool:
    import inspect

    return "persona" in inspect.signature(narrate).parameters
