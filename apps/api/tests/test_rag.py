"""RAG 파이프라인 — 조항 청킹 · 검색 · 인용 강제."""
from __future__ import annotations

import json

import pytest

from rag import answer as answer_mod
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
    monkeypatch.setattr(ingest, "INDEX_PATH", tmp_path / "missing.jsonl")
    retrieve.reset_cache()
    r = answer_mod.ask("무엇이든 물어보세요")
    retrieve.reset_cache()
    assert r["citations"] == []
    assert r["answer"] == answer_mod.NO_EVIDENCE
