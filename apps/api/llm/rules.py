"""규칙기반 슬롯 추출 — LLM 없이도 동작하는 결정론적 경로.

LLM 경로가 있을 때도 후처리 검증(작목 매칭·단위 변환)에 이 모듈을 쓴다.
"""
from __future__ import annotations

import re

from engine.params import crops

# 면적 단위 → 평 환산
PYEONG_PER = {
    "평": 1.0,
    "㎡": 0.3025,
    "m2": 0.3025,
    "m²": 0.3025,
    "제곱미터": 0.3025,
    "마지기": 200.0,   # 밭 기준 관행값. 논·지역에 따라 150~300평
    "아르": 30.25,
    "a": 30.25,
    "ha": 3025.0,
    "헥타르": 3025.0,
    "정보": 3025.0,
}
# 라틴 문자 단위는 단어 일부로 오인되지 않도록 경계를 요구한다 (a, ha, m2).
_LATIN_UNITS = sorted((u for u in PYEONG_PER if u.isascii()), key=len, reverse=True)
_HANGUL_UNITS = sorted((u for u in PYEONG_PER if not u.isascii()), key=len, reverse=True)
_AREA_RE = re.compile(
    r"(\d[\d,]*(?:\.\d+)?)\s*(?:("
    + "|".join(re.escape(u) for u in _HANGUL_UNITS)
    + r")|("
    + "|".join(re.escape(u) for u in _LATIN_UNITS)
    + r")(?![A-Za-z0-9]))"
)

_NUM = r"(\d[\d,]*(?:\.\d+)?)"
_MONEY_RE = re.compile(
    rf"{_NUM}\s*억\s*(?:{_NUM}\s*)?만?\s*원?"
    rf"|{_NUM}\s*천\s*만\s*원?"
    rf"|{_NUM}\s*만\s*원?"
    rf"|{_NUM}\s*원"
)

SUCCESSION_HINTS = ("물려받", "승계", "이어받", "부모님", "가업", "후계")
_MONTHLY_HINTS = ("월", "한 달", "한달", "매달", "매월")


def _to_float(s: str) -> float:
    return float(s.replace(",", ""))


def parse_money(text: str) -> float | None:
    """'3억 5000만원' / '2400만' / '24000000원' → 원 단위 float."""
    m = _MONEY_RE.search(text)
    if not m:
        return None
    eok, eok_man, cheonman, man, won = m.groups()
    if eok is not None:
        total = _to_float(eok) * 100_000_000
        if eok_man is not None:
            total += _to_float(eok_man) * 10_000
        return total
    if cheonman is not None:
        return _to_float(cheonman) * 10_000_000
    if man is not None:
        return _to_float(man) * 10_000
    if won is not None:
        return _to_float(won)
    return None


def parse_area(text: str) -> tuple[float, str] | None:
    """면적 표현 → (평, 원문단위)."""
    m = _AREA_RE.search(text)
    if not m:
        return None
    value = _to_float(m.group(1))
    unit = m.group(2) or m.group(3)
    return value * PYEONG_PER[unit], unit


def match_crop(text: str) -> str | None:
    """작목명·별칭 매칭. 긴 이름부터 시도해 '딸기(시설,수경)'이 '딸기'보다 우선한다."""
    candidates: list[tuple[int, str]] = []
    for crop in crops().values():
        for token in (crop.name, *crop.aliases):
            plain = re.sub(r"[()\s,]", "", token)
            if plain and plain in re.sub(r"[()\s,]", "", text):
                candidates.append((len(plain), crop.id))
    if not candidates:
        return None
    return max(candidates)[1]


def _window(text: str, keywords: tuple[str, ...], width: int = 24) -> str | None:
    """키워드 뒤쪽 구간. '생활비 2400만원' 처럼 값이 뒤따르는 표현용."""
    for kw in keywords:
        i = text.find(kw)
        if i >= 0:
            return text[i : i + width]
    return None


def _window_before(text: str, keywords: tuple[str, ...], before: int = 20, after: int = 6) -> str | None:
    """키워드 앞쪽 구간. '5억 받으려고요' 처럼 값이 앞서는 표현용."""
    for kw in keywords:
        i = text.find(kw)
        if i >= 0:
            return text[max(0, i - before) : i + len(kw) + after]
    return None


def _annualize(amount: float, window: str) -> float:
    return amount * 12 if any(h in window for h in _MONTHLY_HINTS) else amount


def extract(text: str) -> tuple[dict, dict[str, float]]:
    """(slots, confidence). 명시되지 않은 값은 반드시 None."""
    slots: dict = {
        "crop_id": None,
        "pyeong": None,
        "succession": None,
        "years_farming": None,
        "living_cost": None,
        "other_debt_service": None,
        "requested_principal": None,
    }
    conf: dict[str, float] = {}

    crop_id = match_crop(text)
    if crop_id:
        slots["crop_id"] = crop_id
        conf["crop_id"] = 0.9

    area = parse_area(text)
    if area:
        slots["pyeong"] = round(area[0], 2)
        conf["pyeong"] = 0.95 if area[1] == "평" else 0.85

    if any(h in text for h in SUCCESSION_HINTS):
        slots["succession"] = True
        conf["succession"] = 0.8

    m = re.search(r"(\d+)\s*년\s*차", text)
    if m:
        slots["years_farming"] = int(m.group(1))
        conf["years_farming"] = 0.9

    win = _window(text, ("생활비", "생계비", "생활 자금", "가계"))
    if win:
        amount = parse_money(win)
        if amount:
            slots["living_cost"] = _annualize(amount, win)
            conf["living_cost"] = 0.85

    win = _window(text, ("기존 대출", "기존대출", "기존 부채", "기존부채", "빚", "상환 중", "갚고 있"))
    if win:
        amount = parse_money(win)
        if amount:
            slots["other_debt_service"] = _annualize(amount, win)
            conf["other_debt_service"] = 0.7

    win = _window_before(text, ("받으려", "빌리려", "대출받", "신청하려", "융자", "차입"))
    if win:
        amount = parse_money(win)
        if amount:
            slots["requested_principal"] = amount
            conf["requested_principal"] = 0.7

    return slots, conf
