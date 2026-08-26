"""
tests/contract/test_llm_contract.py — LLM 어댑터 계약 테스트 (작성 예시)

**실제 API 를 부르지 않는다.** 가짜 응답으로 "망가진 응답이 왔을 때 우리가 제대로 죽는가"만 본다.
매 커밋 돌아도 무료이고 결과가 항상 같다.

품질(응답이 좋은가)은 여기서 재지 않는다 → `evals/` 에서 야간·수동으로, 기준선 대비 회귀만.
섞는 순간 커밋마다 돈이 나가고 불안정해져서 결국 전부 꺼진다.

여기 있는 케이스는 전부 **실제로 겪은 사고**에서 왔다. 새 프로젝트에 그대로 복사해서
어댑터 이름만 바꿔 쓰면 된다.
"""
import json
import pytest


# ── 테스트 대상 자리 (프로젝트의 실제 어댑터로 교체) ────────────────────────
# from adapters.llm.summarizer import Summarizer, EmptyResponse, ExternalTimeout

class EmptyResponse(Exception): ...
class ExternalTimeout(Exception): ...
class ParseFailed(Exception): ...


class Summarizer:
    """예시 어댑터 — 계약을 만족하는 최소 구현."""

    def __init__(self, client, *, timeout: float = 900.0, max_retries: int = 3):
        if timeout is None:
            raise ValueError("타임아웃은 명시해야 한다")   # 기본값 금지 규칙
        self.client, self.timeout, self.max_retries = client, timeout, max_retries
        self.last_raw: str | None = None                  # 원문 보관 (디버깅 필수)

    def summarize(self, text: str) -> dict:
        raw = self.client.call(text, timeout=self.timeout)
        self.last_raw = raw
        if raw is None or not str(raw).strip():
            raise EmptyResponse("빈 응답 — 성공으로 세지 않는다")
        try:
            return json.loads(raw)
        except json.JSONDecodeError as e:
            raise ParseFailed(f"파싱 실패 raw={str(raw)[:200]!r}") from e


class FakeClient:
    """응답을 마음대로 망가뜨릴 수 있는 가짜. 돈도 네트워크도 안 든다."""

    def __init__(self, response=None, raises=None):
        self.response, self.raises = response, raises
        self.calls: list[dict] = []

    def call(self, text, timeout=None):
        self.calls.append({"text": text, "timeout": timeout})
        if self.raises:
            raise self.raises
        return self.response


# ── 1. 타임아웃 — 기본값에 맡기면 연쇄 전멸한다 ────────────────────────────

def test_timeout_must_be_explicit():
    """타임아웃 None 은 생성 자체가 거부된다."""
    with pytest.raises(ValueError):
        Summarizer(FakeClient(), timeout=None)


def test_timeout_is_passed_to_client():
    """선언한 타임아웃이 실제 호출에 전달되는지 — 선언만 하고 안 넘기는 사고가 흔하다."""
    c = FakeClient(response='{"summary": "ok"}')
    Summarizer(c, timeout=30).summarize("hello")
    assert c.calls[0]["timeout"] == 30


def test_timeout_becomes_domain_error():
    """외부 라이브러리 예외가 core 로 새어나가지 않는다."""
    c = FakeClient(raises=TimeoutError("upstream"))
    with pytest.raises(TimeoutError):        # 실제 구현에선 ExternalTimeout 으로 번역
        Summarizer(c, timeout=5).summarize("x")


# ── 2. 빈 응답 — 성공으로 세면 조용히 오염된다 ─────────────────────────────

@pytest.mark.parametrize("bad", ["", "   ", "\n", None])
def test_empty_response_raises(bad):
    with pytest.raises(EmptyResponse):
        Summarizer(FakeClient(response=bad), timeout=10).summarize("x")


# ── 3. 깨진 응답 — 파싱 실패 시 원문이 남아야 한다 ─────────────────────────

@pytest.mark.parametrize("broken", [
    '{"summary": "잘린 응답',            # 잘림 (max_tokens 소진)
    '{"summary": "ok"} 추가 텍스트',      # 뒤에 잡음
    'Here is the JSON: {"a": 1}',        # 앞에 설명 (모델이 말을 붙임)
    '{Ġ"summary": "x"}',            # 토크나이저 경계 오염 (실제 사고)
])
def test_broken_json_fails_loudly(broken):
    s = Summarizer(FakeClient(response=broken), timeout=10)
    with pytest.raises(ParseFailed):
        s.summarize("x")
    assert s.last_raw == broken, "원문을 남기지 않으면 원인 추적이 불가능하다"


def test_raw_kept_on_success_too():
    s = Summarizer(FakeClient(response='{"summary": "ok"}'), timeout=10)
    s.summarize("x")
    assert s.last_raw is not None


# ── 4. 정상 경로 ───────────────────────────────────────────────────────────

def test_happy_path():
    s = Summarizer(FakeClient(response='{"summary": "ok"}'), timeout=10)
    assert s.summarize("긴 글")["summary"] == "ok"
