"""Anthropic 클라이언트 래퍼.

키가 없으면 None 을 돌려주고, 호출부는 규칙기반 경로로 내려간다.
LLM 은 (a) 자연어 → 구조화 입력, (b) 계산 결과 → 자연어 설명 두 가지만 담당한다.
"""
from __future__ import annotations

import logging
import os

log = logging.getLogger(__name__)

MODEL = os.getenv("ANTHROPIC_MODEL", "claude-opus-5")

_client = None
_tried = False


def get_client():
    """anthropic.Anthropic 인스턴스 또는 None."""
    global _client, _tried
    if _tried:
        return _client
    _tried = True
    if not (os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN")):
        log.info("ANTHROPIC_API_KEY 없음 — 규칙기반 경로로 동작합니다.")
        return None
    try:
        import anthropic

        _client = anthropic.Anthropic()
    except Exception as exc:  # pragma: no cover - 환경 의존
        log.warning("anthropic 클라이언트 초기화 실패: %s", exc)
        _client = None
    return _client


def available() -> bool:
    return get_client() is not None
