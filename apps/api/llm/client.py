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


#: 응답에서 본문이 비어 돌아오는 흔한 원인이 **thinking 토큰이 max_tokens 를
#: 다 먹는 것**이다. 그러면 예외도 없고 stop_reason 도 end_turn 인데 text 블록만
#: 없다. 이 값 아래로는 본문이 안 남을 수 있어 하한을 둔다.
MIN_MAX_TOKENS = 1200


def complete(prompt: str, *, client, max_tokens: int = MIN_MAX_TOKENS,
             purpose: str = "", system: str | None = None,
             output_config: dict | None = None) -> str:
    """프롬프트 하나 → 본문 텍스트. 실패·빈 응답은 **반드시 로그를 남긴다.**

    사고 이력 2026-09-02: `answer_from_tools` 가 max_tokens=700 으로 부르면
    thinking 이 예산을 다 써 text 블록이 비어 돌아왔다. 예외가 아니라서
    `if not text: 템플릿` 갈래로 **조용히** 떨어졌고, 같은 질문에 어떤 때는 LLM
    문장이, 어떤 때는 템플릿 문장이 나왔다. 이 프로젝트가 금지하는 silent
    fallback 이 정확히 이 모양이다 — 예외가 없으니 아무도 모른다.

    키가 없으면 빈 문자열을 돌려준다. 호출부는 그대로 규칙기반 경로로 간다.

    `client` 는 **필수**다. 여기서 `get_client()` 를 부르지 않는다 — 호출부는 이미
    키 유무를 판단한 뒤이고, 여기서 또 부르면 **스텁 지점이 둘로 갈라져** 테스트가
    가짜(또는 None)를 꽂아도 진짜 호출이 나간다. 2026-09-02 두 번 그렇게 됐다:
    한 번은 되가져오기를 넣어서, 한 번은 기본값 None 을 되가져오기로 되살려서.
    """
    if client is None:
        return ""
    budget = max(int(max_tokens), MIN_MAX_TOKENS)
    # system·output_config 는 있을 때만 넘긴다. narrate 처럼 구조화 출력이 필요한
    # 호출부가 여기를 우회해 직접 messages.create 를 부르면, 아래 '본문 없이 응답'
    # 로그를 못 받는다 — 그게 이 함수를 만든 사고의 원인이었다.
    # (적대적 리뷰 M1, 2026-09-02: narrate.py 가 실제로 우회하고 있었다)
    extra: dict = {}
    if system is not None:
        extra["system"] = system
    if output_config is not None:
        extra["output_config"] = output_config
    try:
        msg = client.messages.create(
            model=MODEL, max_tokens=budget,
            messages=[{"role": "user", "content": prompt}],
            **extra,
        )
    except Exception as exc:
        log.warning("LLM 호출 실패%s: %s", f" ({purpose})" if purpose else "", exc)
        return ""

    text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
    if not text.strip():
        log.warning(
            "LLM 이 본문 없이 응답%s (stop_reason=%s, 블록=%s, max_tokens=%d). "
            "thinking 이 예산을 다 썼을 가능성이 큽니다 — 규칙기반으로 대체합니다.",
            f" ({purpose})" if purpose else "", getattr(msg, "stop_reason", "?"),
            [getattr(b, "type", "?") for b in msg.content], budget,
        )
    return text
