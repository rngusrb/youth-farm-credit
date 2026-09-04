"""LLM 문장에 등장하는 수치가 엔진 출력과 일치하는지 검증한다.

일치하지 않으면 500 을 내지 않고 해당 문장만 제거하고 로그를 남긴다(§5 /explain).

## 이 검증기가 실제로 하는 일 — 과장하지 않는다

허용 집합은 **결과 dict 의 모든 수치 리프**다. 좌표(`ToolSpec.returns`)는 쓰지 않는다.
거기에 단위 변형(÷1e4 만원, ÷1e8 억원, ×100 퍼센트, 반올림)까지 얹고 ±0.5% 로 대조한다.

그래서 이건 **지어낸 큰 금액을 잡는 거친 체**다. 작은 정수("5년차", "20%")는 사실상
전부 통과한다 — 1~100 정수의 59%가 무조건 통과한다(실측, 2026-09-02).
도구를 많이 쓴 답변일수록 허용 집합이 커져 더 느슨해진다.

**그래도 이걸 쓰는 이유**: 실제로 걸린 것들이 전부 큰 금액이었다 — 지어낸 한도,
잘못 인용한 소득, 어긋난 상환액. 농가가 크게 다치는 지점이 거기다.
다만 제1원칙("숫자는 LLM 이 만들지 않는다")의 기계적 증거는 `core: []`(deps_check)
쪽이 본체이고 이건 보조라는 것을 문서 어디서도 반대로 적지 않는다.
(적대적 리뷰 H2, 2026-09-02 — 그 전엔 반대로 적혀 있었다)
"""
from __future__ import annotations

import logging
import re
from typing import Any, Iterable

log = logging.getLogger(__name__)

# 산문에 자연스럽게 등장하는 구조적 숫자 — 엔진 출력이 아니어도 허용한다.
# 구조 상수 — '3종', '100%' 처럼 측정값이 아니라 글의 뼈대인 숫자.
# ⚠️ 이것들엔 **오차를 주지 않는다**. 상대오차 0.5% 를 붙이면 100.0 이 99.9 를 통과시켜
# 지어낸 '99.9억원' 이 검증을 그냥 지나간다 (2026-09-01 실측으로 발견한 구멍).
STRUCTURAL = {0.0, 1.0, 2.0, 3.0, 100.0}
_EXACT = 1e-9

# 앞에 글자·로마숫자·하이픈이 붙은 "-2" 는 음수가 아니다 — 조항 번호(Ⅱ-2)다.
# (2026-09-01: 초안의 "Ⅱ-2, Ⅱ-1 조항" 이 수치 불일치로 통째로 제거됐다)
_NUM_RE = re.compile(r"(?<![\w가-힣Ⅰ-Ⅿ\-])-?\d[\d,]*(?:\.\d+)?")
_SENT_RE = re.compile(r"(?<=[.!?])\s+|\n+|(?<=다\.)\s*|(?<=요\.)\s*")


def collect_numbers(obj: Any) -> set[float]:
    """diagnose 응답에서 수치 리프를 모두 긁어온다."""
    out: set[float] = set()

    def walk(node: Any) -> None:
        if isinstance(node, bool):
            return
        if isinstance(node, (int, float)):
            out.add(float(node))
        elif isinstance(node, dict):
            for v in node.values():
                walk(v)
        elif isinstance(node, (list, tuple)):
            for v in node:
                walk(v)

    walk(obj)
    return out


def numbers_in_text(*texts: str) -> set[float]:
    """원문 발췌에서 수치를 뽑는다 — 제도 답변 검증용 허용 집합.

    `collect_numbers` 는 dict/list 의 **수치 리프**만 훑는다. 제도 근거는 조항 원문이라
    숫자가 문장 안에 들어 있어서 그 함수로는 하나도 안 잡힌다.

    사고 이력 2026-09-02 (적대적 리뷰 H3): 제도 답변(`rag.answer.ask`)은 검증을 통째로
    우회하고 있었다. 강제된 것은 *인용 목록이 비지 않는 것*이지 **답변 문장의 수치가
    발췌문에 있는지가 아니었다.** 그래서 "한도 5억원", "3년 이내" 같은 숫자가 아무
    기계 검사도 없이 화면까지 갔다.
    """
    out: set[float] = set()
    for text in texts:
        for tok in _NUM_RE.findall(text or ""):
            try:
                out.add(float(tok.replace(",", "")))
            except ValueError:
                continue
    return out


def allowed_forms(values: Iterable[float]) -> list[float]:
    """같은 값의 표기 변형(만원·억원·퍼센트·반올림)을 모두 허용 목록에 넣는다."""
    forms: set[float] = set()          # 구조 상수는 여기 넣지 않는다 (_matches 가 따로 본다)
    for v in values:
        variants = [v, v / 10_000, v / 100_000_000, v * 100]
        # '3억 3,645만원' 같은 억+만 혼합 표기의 각 자리
        if abs(v) >= 100_000_000:
            eok = int(abs(v) // 100_000_000)
            variants += [float(eok), (abs(v) - eok * 100_000_000) / 10_000]
        for f in variants:
            forms.add(f)
            forms.add(round(f))
            forms.add(round(f, 1))
            forms.add(round(f, 2))
            # 표시용 반올림(백만원·천만원 단위)도 같은 값으로 인정한다.
            if abs(f) >= 1000:
                forms.add(float(round(f, -2)))
                forms.add(float(round(f, -3)))
    return sorted(forms)


def _matches(token: float, forms: list[float]) -> bool:
    """수치가 엔진 값(또는 그 표기 변형)인가.

    측정값은 표기 반올림을 허용하지만, 구조 상수는 **정확히 같을 때만** 인정한다.
    """
    if any(abs(token - s) < _EXACT for s in STRUCTURAL):
        return True
    for f in forms:
        tol = max(abs(f) * 0.005, 0.05)
        if abs(token - f) <= tol:
            return True
    return False


def split_sentences(text: str) -> list[str]:
    return [s for s in (p.strip() for p in _SENT_RE.split(text)) if s]


def verify_text(text: str, diagnosis: Any) -> tuple[str, list[str], list[float]]:
    """(검증 통과 문장만 남긴 텍스트, 제거된 문장, 사용된 수치)."""
    forms = allowed_forms(collect_numbers(diagnosis))
    kept: list[str] = []
    dropped: list[str] = []
    used: list[float] = []

    for sentence in split_sentences(text):
        tokens = [float(t.replace(",", "")) for t in _NUM_RE.findall(sentence)]
        bad = [t for t in tokens if not _matches(t, forms)]
        if bad:
            log.warning("엔진 출력과 불일치하는 수치 %s — 문장 제거: %s", bad, sentence)
            dropped.append(sentence)
        else:
            kept.append(sentence)
            used.extend(tokens)

    return " ".join(kept), dropped, sorted(set(used))
