"""슬롯 추출 — 자연어 서술 → 구조화 입력.

LLM 은 값을 '읽어내기만' 한다. 추정·보정은 금지이고, 명시되지 않은 값은 null 이다.
숫자 계산은 전부 engine/ 이 담당하므로 이 단계에서 금액을 만들어내지 않는다.
"""
from __future__ import annotations

import logging

from pydantic import BaseModel, Field

from engine.params import crops

from . import rules
from .client import MODEL, get_client

log = logging.getLogger(__name__)

REQUIRED = ("crop_id", "pyeong", "living_cost")

FOLLOWUP = {
    "crop_id": "어떤 작목을 재배하실 계획인가요? (예: 딸기 수경, 토마토 수경, 시금치)",
    "pyeong": "재배 면적은 어느 정도인가요? 평·㎡·ha 어느 단위로 말씀하셔도 됩니다.",
    "living_cost": "연간 생활비는 대략 얼마로 잡고 계신가요?",
}


class _LlmSlots(BaseModel):
    """LLM 출력 스키마. 모든 필드는 미확인 시 null."""

    crop_id: str | None = Field(default=None, description="crops.json 의 id. 확신 없으면 null")
    pyeong: float | None = Field(default=None, description="면적을 평으로 환산한 값")
    succession: bool | None = Field(default=None, description="승계·물려받은 농지 여부")
    years_farming: int | None = Field(default=None, description="영농 경력 연차")
    living_cost: float | None = Field(default=None, description="연간 생활비(원). 월 단위면 12배")
    other_debt_service: float | None = Field(default=None, description="기존 부채의 연 상환액(원)")
    requested_principal: float | None = Field(default=None, description="희망 차입 원금(원)")


def _system_prompt() -> str:
    catalog = "\n".join(
        f"- {c.id}: {c.name} (별칭: {', '.join(c.aliases) or '없음'})"
        for c in crops().values()
    )
    return (
        "너는 청년 농업인의 서술에서 여신 진단에 필요한 값만 그대로 읽어내는 추출기다.\n\n"
        "규칙:\n"
        "1. 문장에 명시되지 않은 값은 반드시 null 로 둔다. 추정·평균값 대입 금지.\n"
        "2. 금액은 원 단위 정수로 변환한다. '2400만원'→24000000, '3억'→300000000.\n"
        "3. 생활비가 월 단위면 12를 곱해 연액으로 만든다.\n"
        "4. 면적은 평으로 환산한다. 1㎡=0.3025평, 1a=30.25평, 1ha=3025평, 1마지기=200평.\n"
        "5. crop_id 는 아래 목록의 id 중 하나이거나 null 이다. 목록에 없는 작목이면 null.\n"
        "6. 너는 금액을 계산하거나 한도를 추정하지 않는다. 읽어내는 일만 한다.\n\n"
        f"작목 목록:\n{catalog}"
    )


def _llm_extract(text: str) -> _LlmSlots | None:
    client = get_client()
    if client is None:
        return None
    try:
        response = client.messages.parse(
            model=MODEL,
            max_tokens=2000,
            output_config={"effort": "low"},
            system=_system_prompt(),
            messages=[{"role": "user", "content": text}],
            output_format=_LlmSlots,
        )
        return response.parsed_output
    except Exception as exc:
        log.warning("LLM 슬롯 추출 실패, 규칙기반으로 대체: %s", exc)
        return None


def _sanitize(slots: dict) -> dict:
    """엔진에 넣기 전 마지막 방어선. 범위를 벗어난 값은 미확인으로 되돌린다."""
    if slots.get("crop_id") not in crops():
        slots["crop_id"] = None
    for key in ("pyeong", "living_cost", "other_debt_service", "requested_principal"):
        v = slots.get(key)
        if v is None:
            continue
        try:
            v = float(v)
        except (TypeError, ValueError):
            slots[key] = None
            continue
        if v < 0 or v != v:
            slots[key] = None
        else:
            slots[key] = v
    if slots.get("pyeong") is not None and not (0 < slots["pyeong"] <= 1_000_000):
        slots["pyeong"] = None
    if slots.get("years_farming") is not None:
        try:
            slots["years_farming"] = max(0, int(slots["years_farming"]))
        except (TypeError, ValueError):
            slots["years_farming"] = None
    return slots


def extract(text: str, known: dict | None = None) -> dict:
    """(slots, confidence, missing_required, followup_question, extractor)."""
    rule_slots, rule_conf = rules.extract(text)
    slots = dict(rule_slots)
    conf = dict(rule_conf)
    extractor = "rule"

    parsed = _llm_extract(text)
    if parsed is not None:
        extractor = "llm"
        for key, value in parsed.model_dump().items():
            if value is not None:
                slots[key] = value
                # 규칙기반과 일치하면 확신도를 올리고, 어긋나면 낮춘다.
                agrees = rule_slots.get(key) is not None and _close(rule_slots[key], value)
                conf[key] = 0.95 if agrees else max(conf.get(key, 0.0), 0.75)

    for key, value in (known or {}).items():
        if key in slots and value is not None:
            slots[key] = value
            conf[key] = 1.0

    slots = _sanitize(slots)
    conf = {k: v for k, v in conf.items() if slots.get(k) is not None}

    missing = [k for k in REQUIRED if slots.get(k) is None]
    return {
        "slots": slots,
        "confidence": conf,
        "missing_required": missing,
        "followup_question": FOLLOWUP[missing[0]] if missing else None,
        "defaults_applied": [],
        "extractor": extractor,
    }


def _close(a, b) -> bool:
    if isinstance(a, bool) or isinstance(b, bool):
        return a == b
    try:
        return abs(float(a) - float(b)) <= max(1.0, abs(float(a)) * 0.02)
    except (TypeError, ValueError):
        return a == b
