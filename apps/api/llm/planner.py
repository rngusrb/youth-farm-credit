"""llm/planner.py — 어떤 도구를 어떤 인자로 부를지 고른다 (adapters).

## 이 파일의 자리

숫자는 여기서 만들지 않는다. **도구 이름과 인자만 고른다.**
계산은 전부 `engine/tools.py` 의 결정론 코드가 한다. 그래서 제1원칙이
"지키려고 애쓰는 규칙"이 아니라 구조의 결과가 된다.

## LLM 출력을 믿지 않는다

모델이 없는 도구를 부르거나, 모르는 인자를 넣거나, JSON 이 아닌 것을 낸다.
그래서 **받은 계획을 도구 스펙으로 검증하고, 어긴 부분은 버리되 조용히 버리지 않는다**
(`Plan.warnings` 에 남겨 `trace` 로 화면까지 올라간다).

## 키가 없으면

질문 키워드로 고정 플랜을 고른다. 상담사는 LLM 없이도 동작해야 한다 —
이 저장소의 "API 키 없이도 전체 플로우가 돈다" 원칙.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field

from engine.tools import ENGINE_TOOLS, ToolSpec


def catalog() -> dict[str, ToolSpec]:
    """Planner 가 고를 수 있는 도구 전부 — 엔진 + 제도 검색.

    레이어가 다른 도구를 한 목록으로 합치는 자리다. Planner 는 어느 레이어인지
    모른 채 이름만 고른다.
    """
    from rag.tools import RAG_TOOLS

    return {**ENGINE_TOOLS, **RAG_TOOLS}

from .client import MODEL, get_client

log = logging.getLogger(__name__)

MAX_STEPS = 6          # 도구 실행 상한
MAX_PLAN_CALLS = 2     # 계획 LLM 왕복 상한 (1차 + 스키마 위반 재시도 1회)


@dataclass(frozen=True)
class Step:
    tool: str
    args: dict


@dataclass
class Plan:
    steps: list[Step] = field(default_factory=list)
    ask: list[str] = field(default_factory=list)      # 되물어야 할 슬롯
    reason: str = ""
    method: str = "llm"                                # llm | fallback
    warnings: list[str] = field(default_factory=list)  # 버린 것을 남긴다
    llm_calls: int = 0


_PROMPT = """너는 농가 여신 상담 서비스의 계획 담당이다.
사용자 질문을 보고 **어떤 계산 도구를 어떤 인자로 부를지**만 정한다.
숫자를 직접 만들지 마라 — 계산은 도구가 한다.

쓸 수 있는 도구:
{tools}

이미 아는 값(slots):
{slots}

규칙:
- 필수 인자를 slots 에서 채울 수 없으면 그 인자 이름을 "ask" 에 넣고 steps 는 비워라.
- 아는 값은 args 에 그대로 넣어라.
- 도구는 최대 {max_steps}개까지.
- JSON 만 출력한다. 설명하지 마라.

출력 형식:
{{"ask": [], "steps": [{{"tool": "diagnose", "args": {{"crop_id": "...", "pyeong": 1300}}}}], "reason": "한 줄"}}

질문: {question}"""


def _tool_lines() -> str:
    out = []
    for spec in catalog().values():
        req = ", ".join(spec.required)
        opt = ", ".join(spec.optional) or "-"
        out.append(f"- {spec.name}: {spec.summary}\n    필수: {req}\n    선택: {opt}")
    return "\n".join(out)


# ── 폴백 — 키가 없거나 스키마를 두 번 어겼을 때 ───────────────────────────

_MONEY = re.compile(r"(\d[\d,]*\.?\d*)\s*(억|천만|만)\s*원?")

_RULES: tuple[tuple[tuple[str, ...], tuple[str, ...]], ...] = (
    (("재해", "자격", "요건", "지침", "조항", "나이", "연령", "교육"), ("search_regulation",)),
    (("현금", "자금", "부족", "달", "월별", "운전"), ("cashflow",)),
    (("가격", "하락", "금리", "시나리오", "스트레스", "버틸"), ("stress",)),
    (("얼마", "한도", "빌", "대출", "차입"), ("diagnose",)),
)


def _parse_money(text: str) -> float | None:
    m = _MONEY.search(text)
    if not m:
        return None
    v = float(m.group(1).replace(",", ""))
    return v * {"억": 100_000_000, "천만": 10_000_000, "만": 10_000}[m.group(2)]


def fallback_plan(question: str, slots: dict) -> Plan:
    """키워드로 고정 플랜을 고른다. LLM 없이도 상담이 되게."""
    target = _parse_money(question)
    tools: tuple[str, ...] = ()
    for keys, plan in _RULES:
        if any(k in question for k in keys):
            tools = plan
            break
    if not tools:
        tools = ("diagnose",)
    # 원하는 금액을 말했으면 반사실 탐색까지 붙인다
    if target and "diagnose" in tools:
        tools = ("diagnose", "solve_for")

    steps: list[Step] = []
    ask: list[str] = []
    for name in tools:
        spec = catalog().get(name)
        if spec is None:
            continue
        if name == "search_regulation":
            steps.append(Step(name, {"question": question}))
            continue
        args = {k: slots[k] for k in spec.required + spec.optional if k in slots}
        if name == "solve_for" and target:
            args["target_principal"] = target
        missing = spec.missing(args)
        if missing:
            ask.extend(m for m in missing if m not in ask)
        else:
            steps.append(Step(name, args))
    return Plan(steps=([] if ask else steps), ask=ask, method="fallback",
                reason="키워드 기반 고정 플랜")


# ── 검증 — 받은 계획을 도구 스펙으로 거른다 ───────────────────────────────

def validate(raw: dict, slots: dict) -> Plan:
    plan = Plan(reason=str(raw.get("reason", ""))[:200])
    for name in raw.get("ask") or []:
        if isinstance(name, str) and name not in plan.ask:
            plan.ask.append(name)

    for item in (raw.get("steps") or [])[:MAX_STEPS]:
        if not isinstance(item, dict):
            plan.warnings.append(f"step 이 객체가 아님: {item!r}")
            continue
        name = item.get("tool")
        spec: ToolSpec | None = catalog().get(name)
        if spec is None:
            plan.warnings.append(f"모르는 도구: {name!r}")
            continue
        raw_args = item.get("args") if isinstance(item.get("args"), dict) else {}
        allowed = set(spec.required) | set(spec.optional)
        args = {k: v for k, v in raw_args.items() if k in allowed}
        for k in set(raw_args) - allowed:
            plan.warnings.append(f"{name}: 모르는 인자 {k!r} 버림")
        # slots 로 빈 필수 인자를 채운다
        for k in spec.required:
            if k not in args and k in slots:
                args[k] = slots[k]
        missing = spec.missing(args)
        if missing:
            plan.warnings.append(f"{name}: 필수 인자 없음 {missing} → 되묻기로")
            plan.ask.extend(m for m in missing if m not in plan.ask)
            continue
        plan.steps.append(Step(name, args))

    if len(raw.get("steps") or []) > MAX_STEPS:
        plan.warnings.append(f"steps {len(raw['steps'])}개 → {MAX_STEPS}개로 자름")
    if plan.ask:
        plan.steps = []            # 되물을 게 있으면 실행하지 않는다
    return plan


def plan(question: str, slots: dict | None = None) -> Plan:
    """계획을 세운다. LLM 이 없거나 스키마를 두 번 어기면 폴백."""
    slots = slots or {}
    client = get_client()
    if client is None:
        return fallback_plan(question, slots)

    prompt = _PROMPT.format(tools=_tool_lines(), slots=json.dumps(slots, ensure_ascii=False),
                            max_steps=MAX_STEPS, question=question)
    calls = 0
    for attempt in range(MAX_PLAN_CALLS):
        calls += 1
        try:
            msg = client.messages.create(
                model=MODEL, max_tokens=700,
                messages=[{"role": "user", "content": prompt}],
            )
            text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
            raw = json.loads(_json_slice(text))
        except Exception as exc:                       # 조용히 넘어가지 않는다
            log.warning("계획 파싱 실패(%d회차): %s", attempt + 1, exc)
            continue
        p = validate(raw, slots)
        if p.steps or p.ask:
            p.llm_calls = calls
            return p
        log.warning("계획이 비어 있음(%d회차)", attempt + 1)

    log.warning("계획 %d회 실패 — 폴백", MAX_PLAN_CALLS)
    p = fallback_plan(question, slots)
    p.llm_calls = calls
    p.warnings.append(f"LLM 계획 {MAX_PLAN_CALLS}회 실패 → 키워드 폴백")
    return p


def _json_slice(text: str) -> str:
    """모델이 앞뒤에 말을 붙여도 JSON 부분만 꺼낸다."""
    s, e = text.find("{"), text.rfind("}")
    if s == -1 or e == -1 or e < s:
        raise ValueError(f"JSON 을 찾지 못함: {text[:120]!r}")
    return text[s:e + 1]
