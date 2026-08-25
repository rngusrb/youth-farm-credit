"""결과 해설 — 엔진 출력 JSON → 자연어.

LLM 이 붙어 있으면 LLM 문장을, 없으면 템플릿 문장을 쓴다. 어느 쪽이든
verify.verify_text 를 통과한 문장만 내보낸다.
"""
from __future__ import annotations

import json
import logging

from .client import MODEL, get_client
from .verify import verify_text

log = logging.getLogger(__name__)

SYSTEM = """너는 청년 농업인에게 여신 진단 결과를 설명하는 해설자다.

절대 규칙:
1. 입력 JSON 에 없는 수치를 만들어내지 않는다. 금액·확률·연차는 JSON 값만 인용한다.
2. 단정적 경고를 하지 않는다. "~일 확률이 높습니다" 처럼 확률로 말한다.
3. 대출을 권유하거나 특정 상품을 추천하지 않는다. 투자 조언도 하지 않는다.
4. 이것은 참고 계산이며 대출 심사 결과가 아니다.

본문에 반드시 담을 것:
① 왜 거치기간이 끝나는 해부터 부담이 커지는가 (이자만 내다가 원금이 붙는 구조)
② 신청 가능 한도와 권장 한도의 격차가 뜻하는 것
③ 선택지 두 가지 — 차입 규모를 줄이는 길, 재배 규모를 키우는 길

출력은 JSON 한 개: {"headline": "...", "body": "...", "actions": ["...", "..."]}
headline 은 40자 이내 한 문장, body 는 4~6문장, actions 는 2~3개."""


def _man(v: float) -> str:
    """원 → '3억 3,645만원' 형태. 음수도 부호를 앞에 붙여 그대로 표기한다."""
    sign = "-" if v < 0 else ""
    eok, rest = divmod(abs(round(v)), 100_000_000)
    man = round(rest / 10_000)
    if eok and man:
        return f"{sign}{eok}억 {man:,}만원"
    if eok:
        return f"{sign}{eok}억원"
    if man == 0:
        return "0원"
    return f"{sign}{man:,}만원"


def _pct(v: float) -> str:
    return f"{v * 100:.1f}%"


def _template(d: dict) -> tuple[str, str, list[str]]:
    crop = d["input"]["crop_name"]
    pyeong = d["input"]["pyeong"]
    limits = d["limits"]
    grace_years = d["product"]["grace_years"]

    if d.get("status") == "no_capacity":
        headline = "지금 조건에서는 상환에 쓸 수 있는 돈이 남지 않습니다"
        body = (
            f"{crop} {pyeong:,.0f}평의 연간 농업소득은 {_man(d['income']['annual'])}으로 "
            f"계산됩니다. 여기에서 생활비와 기존 부채 상환을 빼면 남는 금액이 없어, "
            f"이 조건에서는 원리금을 감당하기 어려울 확률이 높습니다. "
            f"같은 작목으로 한도까지 차입한다면 최소 {d['min_area_pyeong']:,.0f}평 규모가 필요합니다. "
            f"면적을 늘리거나, 생활비 기준을 낮추거나, 차입 규모 자체를 줄이는 쪽을 먼저 검토해 보세요."
        )
        actions = [
            f"같은 작목이라면 {d['min_area_pyeong']:,.0f}평 이상 규모를 확보한 뒤 다시 계산해 보기",
            "소득이 높은 작목으로 조건을 바꿔 다시 진단해 보기",
        ]
        return headline, body, actions

    s = d["scenarios"]["at_available"]
    risk_year = s["first_risk_year"]
    risk_phrase = (
        f"{risk_year}년차부터" if risk_year else "상환기에 들어선 뒤부터"
    )

    # 리포트 표지가 위험기반 한도를 결론으로 내세우므로 해설도 같은 숫자로 맞춘다.
    # 서로 다른 금액을 말하면 읽는 사람이 어느 쪽을 믿어야 할지 알 수 없다.
    lead_limit = limits.get("risk_based") or limits["recommended"]
    headline = (
        f"신청 가능한 {_man(limits['available'])} 중 "
        f"{_man(lead_limit)}까지가 감당 가능한 범위입니다"
    )
    body = (
        f"{crop} {pyeong:,.0f}평의 연간 농업소득은 {_man(d['income']['annual'])}, "
        f"생활비와 기존 부채를 빼고 상환에 쓸 수 있는 돈은 {_man(d['income']['capacity'])}입니다. "
        f"한도까지 빌리면 처음 {grace_years}년은 이자만 연 {_man(s['grace_payment'])} 내지만, "
        f"거치기간이 끝나면 원금이 함께 붙어 연 {_man(s['amort_payment'])}으로 "
        f"{s['cliff_multiple']:.1f}배 뛰어오릅니다. "
        f"그래서 {risk_phrase} 상환액이 상환여력을 넘어설 확률이 높아지고, "
        f"2년 연속으로 상환이 밀릴 확률은 {_pct(s['crisis_prob'])}로 계산됩니다. "
        f"신청 가능 한도와 권장 한도의 차이 {_man(limits['gap'])}은 "
        f"'빌릴 수 있지만 갚기는 어려운 구간'을 뜻합니다."
    )
    # 위험기반 한도가 DSCR 한도보다 보수적이면 그 차이를 본문에서 다룬다.
    risk_based = limits.get("risk_based")
    max_crisis = limits.get("max_crisis_prob")
    binding = limits.get("binding_constraint")

    if binding == "livelihood":
        # 차입을 0 으로 줄여도 위기가 남는 경우 — 처방이 다르다.
        floor = limits.get("livelihood_floor_prob", 0.0)
        body += (
            f" 다만 이 조건에서는 대출을 받지 않아도 소득이 생활비 아래로 떨어져 "
            f"2년 연속 적자가 날 확률이 {_pct(floor)}입니다. 차입 규모를 줄이는 것으로는 "
            f"해결되지 않고, 재배 규모나 생활비 기준을 먼저 조정하는 쪽을 봐야 합니다."
        )
    elif risk_based is not None and max_crisis is not None and risk_based < limits["recommended"]:
        rec_crisis = d["scenarios"]["at_recommended"]["crisis_prob"]
        body += (
            f" 다만 DSCR 기준 권장액에서도 2년 연속 상환이 밀릴 확률은 "
            f"{_pct(rec_crisis)}로 계산됩니다. DSCR은 소득이 매년 일정하다고 보고 "
            f"계산하기 때문입니다. 소득이 흔들리는 것까지 감안해 이 확률을 "
            f"{_pct(max_crisis)} 이하로 두려면 {_man(risk_based)} 선입니다."
        )

    if binding == "livelihood":
        actions = [
            f"재배 규모를 {d['min_area_pyeong']:,.0f}평 수준까지 늘렸을 때를 먼저 비교해 보기",
            "생활비 기준을 낮춰 다시 계산해 보기",
            "소득이 더 높은 작목으로 조건을 바꿔 진단해 보기",
        ]
    else:
        actions = [
            f"차입 규모를 {_man(risk_based if risk_based else limits['recommended'])} 수준으로 낮춰 다시 계산해 보기",
            f"같은 한도를 유지하려면 재배 규모를 {d['min_area_pyeong']:,.0f}평까지 늘렸을 때를 비교해 보기",
            "재해 시 상환유예 요건을 미리 확인해 두기",
        ]
    if d.get("sigma_source") == "ASSUMED":
        actions.append(
            "이 확률은 소득 변동성 가정값(σ=0.20)에 기댄 값이라는 점을 감안하기"
        )
    return headline, body, actions


def _llm(d: dict) -> tuple[str, str, list[str]] | None:
    client = get_client()
    if client is None:
        return None
    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=4000,
            output_config={
                "effort": "low",
                "format": {
                    "type": "json_schema",
                    "schema": {
                        "type": "object",
                        "properties": {
                            "headline": {"type": "string"},
                            "body": {"type": "string"},
                            "actions": {"type": "array", "items": {"type": "string"}},
                        },
                        "required": ["headline", "body", "actions"],
                        "additionalProperties": False,
                    },
                },
            },
            system=SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": json.dumps(d, ensure_ascii=False, default=float),
                }
            ],
        )
        text = "".join(b.text for b in response.content if b.type == "text")
        parsed = json.loads(text)
        return parsed["headline"], parsed["body"], list(parsed.get("actions", []))
    except Exception as exc:
        log.warning("LLM 해설 실패, 템플릿으로 대체: %s", exc)
        return None


def narrate(diagnosis: dict) -> dict:
    out = _llm(diagnosis)
    narrator = "llm"
    if out is None:
        out = _template(diagnosis)
        narrator = "template"
    headline, body, actions = out

    checked_head, dropped_head, used_head = verify_text(headline, diagnosis)
    checked_body, dropped_body, used_body = verify_text(body, diagnosis)
    checked_actions: list[str] = []
    dropped_actions: list[str] = []
    used_actions: list[float] = []
    for action in actions:
        kept, dropped, used = verify_text(action, diagnosis)
        if kept:
            checked_actions.append(kept)
        dropped_actions.extend(dropped)
        used_actions.extend(used)

    if not checked_head:
        # 헤드라인이 통째로 걸러졌다면 템플릿 헤드라인으로 되돌린다.
        checked_head = _template(diagnosis)[0]

    return {
        "headline": checked_head,
        "body": checked_body,
        "actions": checked_actions,
        "numbers_used": sorted(set(used_head + used_body + used_actions)),
        "dropped_sentences": dropped_head + dropped_body + dropped_actions,
        "narrator": narrator,
    }
