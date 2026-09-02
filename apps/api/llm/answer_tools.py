"""llm/answer_tools.py — 도구 결과 아무거나 → 자연어 (adapters).

## 왜 따로 있나

`narrate` 는 **진단 전용**이다. 진단 JSON 의 구조(limits·income·product)를 알고
그 구조에 맞춘 프롬프트를 쓴다. 그래서 에이전트가 `switch_crop` 이나 `funding_map`
만 골랐을 때는 해설할 방법이 없었다.

사고 이력 2026-09-02: "가지로 바꾸거나 섞으면 안정될까요?" 에 에이전트가
`switch_crop` 을 정확히 골라 실행하고도 **본문이 빈 채로 답했다**.
도구는 늘렸는데 그 결과를 말로 바꾸는 경로를 안 만들었기 때문이다.

## 지키는 것 — narrate 와 똑같다

숫자는 도구 결과에만 있는 것을 쓰고, 어긋난 문장은 뺀다. 키가 없으면 템플릿으로
같은 골격을 만든다. **검증은 어느 경로든 똑같이 통과해야 한다.**
"""
from __future__ import annotations

import json
import logging

from .client import complete, get_client
from .verify import verify_text

log = logging.getLogger(__name__)

MAX_CHARS = 4000

_PROMPT = """너는 청년 농업인에게 계산 결과를 설명하는 해설자다.

절대 규칙:
1. 아래 [계산 결과]에 없는 수치를 만들어내지 않는다.
2. **JSON 의 필드명을 문장에 쓰지 않는다.** blended_sigma·crisis_prob 같은 내부
   이름은 농가가 읽는 말이 아니다. 뜻을 우리말로 풀어 쓴다.
3. 단정적 경고를 하지 않는다. 확률로 말한다.
4. 대출이나 특정 작목을 권유하지 않는다. 선택지와 그 결과만 적는다.
5. 결과에 "반영하지 않았다"고 적힌 것이 있으면 **반드시 그대로 밝힌다.**

농가가 물은 것: {question}

[계산 결과]
{facts}

3~5문장으로 답한다. 첫 문장에서 물은 것에 바로 답한다."""


def _facts(results: dict) -> str:
    """도구 결과를 그대로 넘긴다. 요약하지 않는다 — 요약이 곧 숫자 만들기다."""
    return json.dumps(results, ensure_ascii=False, default=str)[:MAX_CHARS]


def _template(question: str, results: dict) -> str:
    """키가 없을 때의 골격. 도구별로 한 줄씩, 값은 그대로."""
    lines: list[str] = []

    sw = results.get("switch_crop")
    if sw:
        cur = sw["current"]
        for c in sw.get("diversify", [])[:2]:
            lines.append(
                f"{cur['crop_name']}에 {c['crop_name']}을 절반씩 섞으면 소득 변동성이 "
                f"{cur['sigma']:.3f}에서 {c['blended_sigma']:.3f}으로 낮아집니다.")
        for c in sw.get("replace", [])[:2]:
            lines.append(
                f"같은 면적으로 {c['crop_name']}을 하면 소득은 지금의 "
                f"{c['income_ratio']:.0%} 수준, 변동성은 {c['sigma']:.3f}입니다.")
        if sw.get("note"):
            lines.append(sw["note"])

    fm = results.get("funding_map")
    if fm:
        lines.extend(m["label"] for m in fm.get("milestones", []) if m.get("label"))

    b = results.get("benchmark")
    if b and b.get("comparable"):
        lines.append(
            f"최근 {b['years']}개년 실적 평균 {b['my_income']:,.0f}원은 전국 "
            f"{b['crop_name']} 평균 {b['average_income']:,.0f}원의 {b['ratio']:.0%} 수준입니다.")
    elif b:
        lines.append(b.get("message", ""))

    cf = results.get("cashflow")
    if cf:
        lines.append(
            f"가장 빠듯한 달은 {cf['trough_month']}월이고, 그때 "
            f"{cf['working_capital_need']:,.0f}원이 모자랍니다."
            if cf.get("working_capital_need", 0) > 0 else
            f"가장 빠듯한 달은 {cf['trough_month']}월이며 그때도 "
            f"{cf['trough_balance']:,.0f}원이 남습니다.")

    return " ".join(l for l in lines if l)


def answer_from_tools(question: str, results: dict) -> tuple[str, list[str], list[float]]:
    """도구 결과로 답한다. (검증 통과 본문, 제거된 문장, 쓰인 수치)"""
    text = complete(
        _PROMPT.format(question=question[:300], facts=_facts(results)),
        max_tokens=1600, purpose="도구 결과 해설", client=get_client(),
    )

    if not text.strip():
        text = _template(question, results)

    return verify_text(text, results)
