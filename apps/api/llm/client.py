"""Anthropic 클라이언트 래퍼.

키가 없으면 None 을 돌려주고, 호출부는 규칙기반 경로로 내려간다.
LLM 은 (a) 자연어 → 구조화 입력, (b) 계산 결과 → 자연어 설명 두 가지만 담당한다.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

log = logging.getLogger(__name__)

# apps/api/.env 를 읽는다. requirements 에 python-dotenv 가 있는데 아무도 부르지
# 않아서, 키를 넣어도 preview 로 띄운 서버에는 안 넘어가고 있었다 (2026-09-01).
# .env 는 .gitignore 에 있고, harness 의 시크릿 스캔이 커밋을 막는다.
try:
    from dotenv import load_dotenv

    _ENV = Path(__file__).resolve().parent.parent / ".env"
    if _ENV.exists():
        load_dotenv(_ENV)
        log.info(".env 로드: %s", _ENV)
except ImportError:  # dotenv 없이도 셸 환경변수로 동작한다
    log.debug("python-dotenv 없음 — 셸 환경변수만 읽습니다")

#: 기본 모델. 이 서비스에서 LLM 이 하는 일은 (a) 문장 → 슬롯 (b) 계산 결과 → 문장
#: 두 가지뿐이고 **숫자는 만들지 않는다**. 추론 난도가 높지 않아 소넷으로 충분하다.
#: 바꾸려면 .env 의 ANTHROPIC_MODEL 만 고친다 — 코드에 모델명을 박지 않는다.
MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5")

#: 외부 호출 상한. 기본값에 맡기지 않는다 — 아래 클라이언트 생성 주석 참고.
TIMEOUT_S = float(os.getenv("ANTHROPIC_TIMEOUT_S", "120"))
MAX_RETRIES = int(os.getenv("ANTHROPIC_MAX_RETRIES", "2"))

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

        # 타임아웃을 기본값에 맡기지 않는다. 프롬프트가 길어지는 구간에서 기본
        # 타임아웃에 걸려 연쇄 실패하는 사고가 다른 프로젝트에서 있었고(이식된 규칙),
        # 이 저장소의 GC 검사가 실제로 이 줄을 잡았다 (2026-09-01).
        _client = anthropic.Anthropic(timeout=TIMEOUT_S, max_retries=MAX_RETRIES)
    except Exception as exc:  # pragma: no cover - 환경 의존
        log.warning("anthropic 클라이언트 초기화 실패: %s", exc)
        _client = None
    return _client


def available() -> bool:
    return get_client() is not None
