"""결과 해설 — 엔진 출력 JSON → 자연어.

LLM 이 붙어 있으면 LLM 문장을, 없으면 템플릿 문장을 쓴다. 어느 쪽이든
verify.verify_text 를 통과한 문장만 내보낸다.
"""
from __future__ import annotations

import json
import logging

from .client import complete, get_client
from .verify import verify_text

log = logging.getLogger(__name__)

SYSTEM = """너는 청년 농업인에게 여신 진단 결과를 설명하는 해설자다.

절대 규칙:
1. 입력 JSON 에 없는 수치를 만들어내지 않는다. 금액·확률·연차는 JSON 값만 인용한다.
2. 단정적 경고를 하지 않는다. "~일 확률이 높습니다" 처럼 확률로 말한다.
3. 대출을 권유하거나 특정 상품을 추천하지 않는다. 투자 조언도 하지 않는다.
4. 이것은 참고 계산이며 대출 심사 결과가 아니다.
5. **JSON 의 필드명을 문장에 쓰지 않는다.** cliff_multiple·crisis_prob·risk_based 같은
   내부 이름은 농가가 읽는 말이 아니다. 뜻을 우리말로 풀어 쓴다
   (예: cliff_multiple → "상환액이 몇 배로 뛴다", crisis_prob → "2년 연속 모자랄 확률").

본문에 반드시 담을 것:
① 왜 거치기간이 끝나는 해부터 부담이 커지는가 (이자만 내다가 원금이 붙는 구조)
② 세 한도의 뜻이 다르다는 것. 부를 때는 **아래 우리말 이름만** 쓴다
   (JSON 필드명을 괄호에 병기하지도 마라 — 절대규칙 5):
   · available → "제도상 신청 가능 한도"
   · recommended → "은행이 보는 선"
   · risk_based → "권장 차입"
   **'권장'은 risk_based 에만 붙인다.** 화면 타일이 그렇게 부르고 있어서,
   다른 금액에 붙이면 같은 화면에서 권장이 두 개가 된다.
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
            _act(f"같은 작목이라면 {d['min_area_pyeong']:,.0f}평 이상을 확보한 뒤 다시 보기",
                 "지금 조건에서는 상환에 쓸 돈이 남지 않아요.", LINK_FARM),
            _act("소득이 높은 작목으로 조건을 바꿔 보기", "", LINK_FARM),
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
    # 화법 규칙 2 — 판정("감당 가능한 범위") 대신 조건을 밝힌다.
    headline = (
        f"2년 연속 위기 확률 {_pct(limits.get('max_crisis_prob') or 0.1)} 기준으로는 "
        f"{_man(lead_limit)}입니다"
    )
    body = (
        f"{crop} {pyeong:,.0f}평의 연간 농업소득은 {_man(d['income']['annual'])}, "
        f"생활비와 기존 부채를 빼고 상환에 쓸 수 있는 돈은 {_man(d['income']['capacity'])}입니다. "
        f"한도까지 빌리면 처음 {grace_years}년은 이자만 연 {_man(s['grace_payment'])} 내지만, "
        f"거치기간이 끝나면 원금이 함께 붙어 연 {_man(s['amort_payment'])}으로 "
        f"{s['cliff_multiple']:.1f}배 뛰어오릅니다. "
        f"그래서 {risk_phrase} 상환액이 상환여력을 넘어설 확률이 높아지고, "
        f"2년 연속으로 상환이 밀릴 확률은 {_pct(s['crisis_prob'])}로 계산됩니다. "
        f"{_man(limits['available'])}를 다 빌리면 이 확률이 {_pct(s['crisis_prob'])}, "
        f"{_man(lead_limit)}에서는 {_pct(limits.get('max_crisis_prob') or 0.1)}입니다. "
        f"그 사이가 {_man(limits.get('unsafe_gap') or 0)}입니다."
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

    actions = _actions(d)
    return headline, body, actions


# 화면이 링크로 바꿀 키. 문자열 경로를 여기 두면 프런트 라우트가 바뀔 때 서버도 고쳐야 한다.
# 무엇을 가리키는지만 말하고 주소는 화면이 정한다.
LINK_FARM = "farm"
LINK_REVENUE = "revenue"
LINK_SAFETY = "safety"
LINK_FINANCE = "finance"
LINK_RELIEF = "relief"
LINK_POLICY = "policy"


def _act(text: str, detail: str = "", link: str | None = None) -> dict:
    return {"text": text, "detail": detail, "link": link}


def _actions(d: dict) -> list[dict]:
    """그 농가의 실제 숫자에서 다음 걸음을 뽑는다.

    고정 목록이면 "면적을 늘려라" 수준에서 멈춘다. 조건마다 다른 것을 내고,
    **그렇게 하면 숫자가 어떻게 되는지**를 같이 적는다 (화법 규칙 5).
    """
    limits = d["limits"]
    risk_based = limits.get("risk_based") or limits["recommended"]
    product = d["product"]
    out: list[dict] = []

    if limits.get("binding_constraint") == "livelihood":
        out.append(_act(
            f"재배 규모를 {d['min_area_pyeong']:,.0f}평까지 늘렸을 때를 먼저 보기",
            "차입을 줄이는 것으로는 풀리지 않는 상태예요.", LINK_FARM))
        out.append(_act("생활비 기준을 낮춰 다시 계산해 보기", "", LINK_FARM))
        out.append(_act("소득이 더 높은 작목으로 조건을 바꿔 보기", "", LINK_FARM))
        return out

    at_avail = d["scenarios"]["at_available"]
    gap = limits["available"] - risk_based
    if gap > 0:
        out.append(_act(
            f"차입을 {_man(risk_based)}으로 낮추면",
            f"{product['grace_years'] + 1}년차 상환액이 "
            f"{_man(at_avail['amort_payment'])} → "
            f"{_man(d['scenarios'].get('at_risk_based', at_avail)['amort_payment'])}으로 줄어요.",
            LINK_REVENUE))

    if product["grace_years"] >= 5:
        out.append(_act(
            "거치기간을 줄이면 어떻게 되는지 보기",
            "시행지침상 최대 5년 이내에서 고를 수 있어요. 짧게 잡으면 절벽이 앞당겨지는 대신 "
            "총이자와 잔액이 빨리 줄어듭니다.", LINK_POLICY))

    rb = d["scenarios"].get("at_risk_based") or at_avail
    if rb.get("first_risk_year"):
        out.append(_act(
            f"{rb['first_risk_year']}년차 전에 대비해 두기",
            "그 해부터 연간 부족 확률이 20%를 넘어요. 연체가 시작된 뒤에는 쓸 수 있는 제도가 줄어듭니다.",
            LINK_RELIEF))
    else:
        out.append(_act(
            "재해 시 상환연기 요건을 미리 확인해 두기",
            "피해율 30% 이상이면 1~2년 연기가 가능해요.", LINK_RELIEF))

    if not d.get("sigma_personalized"):
        out.append(_act(
            "지난 3개년 농업소득을 넣으면 이 숫자가 달라져요",
            "지금은 작목 평균 변동성으로 계산했어요. 실제 이력이 있으면 그것으로 바꿉니다.",
            LINK_FARM))

    factors = d.get("factors") or {}
    if factors.get("driver") == "price":
        out.append(_act(
            "받는 값이 흔들리는 작목이에요",
            "계약재배·수매 약정으로 판매가를 미리 묶거나, 출하 시기를 나눠 한 시점 시세에 "
            "몰리지 않게 하는 방법이 있어요.", LINK_SAFETY))
    elif factors.get("driver") == "quantity":
        out.append(_act(
            "수확량이 흔들리는 작목이에요",
            "가격보다 작황이 소득을 좌우해요. 재해 대비와 시설 보완 쪽을 먼저 보시는 게 낫습니다.",
            LINK_SAFETY))

    out.append(_act(
        "농신보 보증료는 이 계산에 없어요",
        "시행지침에 요율이 없어 넣지 않았어요. 취급 기관에 확인하시면 실제 부담은 조금 더 큽니다.",
        LINK_FINANCE))
    return out


def _llm(d: dict) -> tuple[str, str, list[str]] | None:
    client = get_client()
    if client is None:
        return None
    try:
        text = complete(
            json.dumps(d, ensure_ascii=False, default=float),
            client=client, max_tokens=4000, purpose="해설",
            system=SYSTEM,
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
        )
        parsed = json.loads(text)
        # LLM 은 문자열만 낸다. 링크는 규칙기반 경로에서만 붙인다 —
        # 어느 화면으로 보낼지는 지어낼 수 있는 값이 아니다.
        return (
            parsed["headline"],
            parsed["body"],
            [_act(str(a)) for a in parsed.get("actions", [])],
        )
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
    checked_actions: list[dict] = []
    dropped_actions: list[str] = []
    used_actions: list[float] = []
    for action in actions:
        # text 와 detail 을 따로 검사한다. 엔진에 없는 수치가 든 쪽만 떨어진다.
        kept_text, dropped_t, used_t = verify_text(action["text"], diagnosis)
        kept_detail, dropped_d, used_d = verify_text(action.get("detail", ""), diagnosis)
        dropped_actions.extend(dropped_t + dropped_d)
        used_actions.extend(used_t + used_d)
        if kept_text:
            checked_actions.append(
                {"text": kept_text, "detail": kept_detail, "link": action.get("link")}
            )

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
