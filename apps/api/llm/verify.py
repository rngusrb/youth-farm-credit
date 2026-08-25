"""LLM 문장에 등장하는 수치가 엔진 출력과 일치하는지 검증한다.

일치하지 않으면 500 을 내지 않고 해당 문장만 제거하고 로그를 남긴다(§5 /explain).
"""
from __future__ import annotations

import logging
import re
from typing import Any, Iterable

log = logging.getLogger(__name__)

# 산문에 자연스럽게 등장하는 구조적 숫자 — 엔진 출력이 아니어도 허용한다.
STRUCTURAL = {0.0, 1.0, 2.0, 3.0, 100.0}

_NUM_RE = re.compile(r"-?\d[\d,]*(?:\.\d+)?")
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


def allowed_forms(values: Iterable[float]) -> list[float]:
    """같은 값의 표기 변형(만원·억원·퍼센트·반올림)을 모두 허용 목록에 넣는다."""
    forms: set[float] = set(STRUCTURAL)
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
