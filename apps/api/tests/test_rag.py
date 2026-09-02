"""RAG 파이프라인 — 조항 청킹 · 검색 · 인용 강제."""
from __future__ import annotations

import json

import pytest

from rag import answer as answer_mod
from llm.verify import numbers_in_text
from rag import expand as expand_mod
from rag import ingest, retrieve

SAMPLE = [
    {
        "doc_title": "테스트 지침",
        "doc_year": 2026,
        "section_path": "III-2-나",
        "source_url": "https://example.test/guide",
        "text": "지원대상자는 사업 신청일 기준 다른 직업에 상시 종사하지 아니하여야 한다.",
    },
    {
        "doc_title": "테스트 지침",
        "doc_year": 2026,
        "section_path": "IV-1",
        "source_url": "https://example.test/guide",
        "text": "융자금의 상환은 5년 거치 20년 균분상환으로 한다.",
    },
]


@pytest.fixture
def corpus(tmp_path, monkeypatch):
    monkeypatch.setattr(ingest, "CORPUS_DIR", tmp_path)
    monkeypatch.setattr(ingest, "INDEX_PATH", tmp_path / "index.jsonl")
    (tmp_path / "guide.jsonl").write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in SAMPLE), encoding="utf-8"
    )
    ingest.build_index()
    retrieve.reset_cache()
    yield tmp_path
    retrieve.reset_cache()


def test_ingest_preserves_section_path(corpus):
    rows = ingest.load_index()
    assert {r["section_path"] for r in rows} == {"III-2-나", "IV-1"}
    assert all(r["source_url"] for r in rows)


def test_ingest_requires_metadata(tmp_path, monkeypatch):
    monkeypatch.setattr(ingest, "CORPUS_DIR", tmp_path)
    monkeypatch.setattr(ingest, "INDEX_PATH", tmp_path / "index.jsonl")
    (tmp_path / "bad.jsonl").write_text('{"text":"본문만 있음"}', encoding="utf-8")
    with pytest.raises(ValueError, match="필수 메타데이터"):
        ingest.build_index()


def test_text_chunking_builds_heading_path(tmp_path, monkeypatch):
    monkeypatch.setattr(ingest, "CORPUS_DIR", tmp_path)
    monkeypatch.setattr(ingest, "INDEX_PATH", tmp_path / "index.jsonl")
    (tmp_path / "plain.txt").write_text(
        "# 평문 지침 | 2026 | https://example.test\n"
        "제3조 지원대상\n"
        "만 18세 이상 만 49세 이하인 자로 한다.\n"
        "제4조 융자조건\n"
        "연리 1.5퍼센트로 한다.\n",
        encoding="utf-8",
    )
    rows = [c for c in ingest.build_index()]
    assert [c.section_path for c in rows] == ["제3조", "제4조"]
    assert rows[0].doc_title == "평문 지침"
    assert rows[0].doc_year == 2026


@pytest.fixture(autouse=True)
def _no_llm(monkeypatch):
    """계약 테스트는 규칙기반 경로에서 돈다.

    사고 이력: 2026-09-02 전체 테스트가 실제 LLM 을 9회 때리고 있었고 5회가 여기였다
    (질의확장 + 답변생성). **이 파일의 단언은 하나도 생성 문장을 보지 않는다** —
    인용 원문 일치, 근거 없을 때 거절, 검색 상위 조항뿐이다. 오히려 스텁이 더 정확하다:
    LLM 이 답을 쓰든 말든 인용 강제가 걸리는지가 검사 대상이기 때문이다.
    """
    monkeypatch.setattr(expand_mod, "get_client", lambda: None)
    monkeypatch.setattr(answer_mod, "get_client", lambda: None)


def test_retrieve_finds_relevant_section(corpus):
    hits = retrieve.search("직장 다니면서 신청할 수 있나요?")
    assert hits
    assert hits[0]["section_path"] == "III-2-나"


def test_answer_returns_verbatim_citation(corpus):
    r = answer_mod.ask("직장 다니면서 신청할 수 있나요?")
    assert r["citations"]
    assert r["citations"][0]["text"] == SAMPLE[0]["text"]  # 원문 그대로, 요약 금지
    assert r["citations"][0]["url"] == "https://example.test/guide"
    assert r["confidence"] in ("high", "medium", "low")


def test_answer_refuses_without_evidence(corpus):
    r = answer_mod.ask("드론 구매 보조금은 얼마인가요?")
    if not r["citations"]:
        assert r["answer"] == answer_mod.NO_EVIDENCE
        assert r["confidence"] == "none"


def test_empty_corpus_never_answers(tmp_path, monkeypatch):
    """원문도 색인도 없으면 절대 답하지 않는다.

    ⚠️ CORPUS_DIR 도 함께 비워야 한다. INDEX_PATH 만 바꾸면 load_index 의 지연생성이
    **실제 코퍼스에서 색인을 새로 만들어** 답을 낸다 — 그러면 이 테스트가 주장하는
    '빈 코퍼스' 상태가 애초에 만들어지지 않는다. (2026-09-01: 그 상태로 통과하고 있었다)
    """
    monkeypatch.setattr(ingest, "INDEX_PATH", tmp_path / "missing.jsonl")
    monkeypatch.setattr(ingest, "CORPUS_DIR", tmp_path)
    retrieve.reset_cache()
    r = answer_mod.ask("무엇이든 물어보세요")
    retrieve.reset_cache()
    assert r["citations"] == []
    assert r["answer"] == answer_mod.NO_EVIDENCE

def test_regulation_answer_drops_numbers_not_in_excerpts(corpus, monkeypatch):
    """발췌문에 없는 수치를 쓴 문장은 제도 답변에서도 뺀다.

    사고 이력 2026-09-02 (적대적 리뷰 H3): 제도 답변은 검증을 통째로 우회했다.
    강제된 것은 *인용 목록이 비지 않는 것* 이었지 **문장 속 숫자가 발췌문에
    있는지가 아니었다.** "한도 5억원", "3년 이내" 같은 값이 그냥 화면까지 갔다.
    """
    monkeypatch.setattr(
        answer_mod, "_llm_answer",
        lambda q, h: "한도는 7억 4천만원이며 상환기간은 17년입니다. 조항을 확인하세요.")
    r = answer_mod.ask("직장 다니면서 신청할 수 있나요?")
    assert r["dropped"], "지어낸 수치 문장이 그대로 통과했다"
    assert "17년" not in r["answer"]


def test_regulation_answer_keeps_numbers_that_are_in_excerpts(corpus, monkeypatch):
    """반대로, 발췌문에 있는 수치는 지우지 않는다 — 검증이 과잉이면 답이 빈다."""
    q = "융자금 상환은 어떻게 하나요?"          # SAMPLE IV-1 (5년 거치 20년) 을 노린다
    hits = answer_mod.search(q)
    assert hits, "전제: 검색 결과가 있어야 한다"
    nums = sorted(numbers_in_text(*[(h.get("text") or "") for h in hits]))
    assert nums, "전제: 발췌문에 숫자가 있어야 이 검사가 의미 있다"
    n = nums[0]
    shown = f"{int(n)}" if float(n).is_integer() else f"{n}"
    monkeypatch.setattr(answer_mod, "_llm_answer",
                        lambda q, h: f"관련 기준은 {shown} 입니다.")
    r = answer_mod.ask(q)
    assert not r["dropped"], f"발췌문에 있는 {shown} 을 지웠다"
