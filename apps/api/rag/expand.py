"""질의 확장 — 사용자의 말과 지침의 말을 잇는다 (adapters).

지침은 '연 1회 후취' 라고 쓰고 사람은 '이자 언제 내요' 라고 묻는다.
BM25 는 어휘가 겹쳐야 잡히므로 이 간극이 그대로 검색 실패가 된다.

두 경로가 있다. LLM 키가 있으면 LLM 이 지침 용어로 바꿔 쓰고,
없으면 아래 용어집으로 확장한다. **없다고 조용히 원문만 쓰지 않는다** —
어느 경로를 탔는지 호출자에게 알린다.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from llm.client import get_client

# 지침 원문에서 실제로 쓰이는 표현만 넣는다. 지어낸 동의어는 검색을 망친다.
# (각 우변은 코퍼스 grep 으로 존재를 확인한 어휘다)
GLOSSARY: dict[str, tuple[str, ...]] = {
    "이자": ("금리", "후취", "이차보전"),
    "언제": ("기한", "기일", "후취"),
    "한도": ("최대", "억원", "대출한도"),
    "나이": ("세", "연령", "만"),
    "연령": ("세", "만"),
    "자격": ("지원자격", "요건", "선정"),
    "거치": ("거치기간", "상환기간", "융자조건"),
    "상환": ("융자금", "상환기한", "균등분할"),
    "재해": ("피해율", "농어업재해대책법", "상환기한 연기"),
    "연기": ("유예", "상환기한", "연기"),
    "위반": ("제재", "취소", "환수"),
    "벌금": ("제재", "환수", "취소"),
    "면적": ("경영규모", "영농기반", "농지"),
    "보증": ("농신보", "신용보증", "담보"),
    "교육": ("이수", "교육시간", "선도농가"),
    "승계": ("승계형", "후계농업경영인"),
    "창업": ("창업형", "독립경영"),
}

_PROMPT = """당신은 농림축산식품부 시행지침 검색 보조자다.
사용자 질문을 지침 원문에 실제로 등장할 법한 **검색어**로 바꿔라.

규칙:
- 지침의 공식 용어를 쓴다 (예: 이자 → 후취/금리, 나이 → 연령/만 OO세)
- answer 를 쓰지 마라. 검색어만 낸다.
- 한 줄, 공백으로 구분된 단어 5~12개. 다른 말은 쓰지 않는다.

질문: {q}"""


@dataclass(frozen=True)
class Expansion:
    query: str          # 검색에 실제로 쓸 질의
    added: tuple[str, ...]
    method: str         # "llm" | "glossary" | "none"


# 확장어 상한. 이보다 많이 넣으면 변별력이 희석된다.
# 실측: '지원 자격 나이 제한' 에 7개를 붙이면 정답이 10위 밖으로 밀리고,
# 가장 변별력 있는 '연령' 하나만 붙이면 1위로 온다.
MAX_ADDED = 2


def _by_glossary(question: str) -> tuple[str, ...]:
    found: list[str] = []
    for key, syns in GLOSSARY.items():
        if key not in question:
            continue
        for syn in syns:
            # 이미 질의에 있거나(자격 → 지원자격) 질의어를 품은 말은 변별력이 없다.
            # '지원 자격 나이 제한' 에 '지원자격' 을 더하면 상위 조항('1. 지원자격 및 요건')이
            # 정작 답이 있는 하위 조항('가. 연령 : 18세~49세')을 밀어낸다.
            if syn in question or key in syn:
                continue
            found.append(syn)
    found = list(dict.fromkeys(found))
    return tuple(_most_discriminative(found, MAX_ADDED))


def _most_discriminative(terms: list[str], n: int) -> list[str]:
    """코퍼스에서 드물게 나오는 순으로 고른다(높은 IDF = 높은 변별력).

    흔한 말(‘선정’, ‘요건’)은 아무 문서나 끌어와 정답을 밀어낸다.
    """
    if len(terms) <= n:
        return terms
    from .retrieve import document_frequency
    return sorted(terms, key=document_frequency)[:n]


def _by_llm(question: str) -> tuple[str, ...] | None:
    client = get_client()
    if client is None:
        return None
    try:
        msg = client.messages.create(
            model="claude-opus-5",
            max_tokens=120,
            messages=[{"role": "user", "content": _PROMPT.format(q=question)}],
        )
        text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
    except Exception as e:  # 조용히 넘어가지 않는다
        import logging
        logging.getLogger(__name__).warning("질의 확장 LLM 실패, 용어집으로 대체: %s", e)
        return None
    words = [w for w in re.split(r"\s+", text.strip()) if w and w not in question]
    return tuple(dict.fromkeys(words))[:12] or None


def expand(question: str, use_llm: bool = True) -> Expansion:
    added = _by_llm(question) if use_llm else None
    method = "llm"
    if not added:
        added, method = _by_glossary(question), "glossary"
    if not added:
        return Expansion(question, (), "none")
    return Expansion(f"{question} {' '.join(added)}", added, method)
