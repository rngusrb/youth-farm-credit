"""실제 시행지침 코퍼스에 대한 검색 품질 회귀 테스트.

여기 숫자는 '몇 점 나왔다' 자랑이 아니라 **하한선**이다. 청킹이나 확장 로직을
건드렸을 때 조용히 나빠지는 걸 막는 게 목적이다.

정답 기준은 '질문에 실제로 답하는 문구가 상위 k 개 청크 안에 있는가' 다.
질문 8개는 손으로 만든 것이고, 그만큼 작다 — 절대 성능의 증거로 쓰지 말 것.
"""
from __future__ import annotations

import pytest

from rag.expand import expand
from rag.ingest import CORPUS_DIR, build_index, load_index
from rag.retrieve import reset_cache, search

# (질문, 정답 청크에 반드시 들어 있는 문구)
GOLD = [
    ("거치기간은 최대 몇 년까지 선택할 수 있나", "거치기간"),
    ("재해로 피해를 입으면 상환을 연기할 수 있나", "피해율"),
    ("이자는 언제 내나", "연 1회 후취"),
    ("융자 한도는 얼마인가", "5억원"),
    ("의무영농기간을 어기면 어떻게 되나", "의무영농기간"),
    ("대출금리는 몇 퍼센트인가", "고정금리"),
    ("상환 방식은 어떻게 되나", "균등분할"),
    ("지원 자격 나이 제한", "18세"),
]

# 실측 하한. 2026-08-26 기준 실제값은 recall@1=6, recall@5=8.
MIN_RECALL_AT_1 = 6
MIN_RECALL_AT_5 = 8


@pytest.fixture(scope="module")
def corpus() -> list[dict]:
    if not any(CORPUS_DIR.glob("*.txt")):
        pytest.skip("코퍼스 원문 없음 — python -m rag.fetch_guidelines 로 받는다")
    build_index()
    reset_cache()
    return load_index()


@pytest.fixture(autouse=True)
def _deterministic_expansion(monkeypatch):
    """recall 회귀 측정은 **용어집 경로**로 고정한다.

    LLM 질의확장은 같은 질문에 매번 다른 확장어를 낸다(실측: '지원 자격 나이 제한' →
    ('신청자격','연령') / ('지원자격','신청자격') / ('우선순위','신청자격')).
    그 경로로 recall 을 재면 기준선이 흔들려 **회귀인지 운인지 구분할 수 없다.**
    LLM 경로의 검색 품질은 계약 테스트가 아니라 별도 평가에서 잰다
    (계약 테스트는 무료·결정적이어야 한다는 원칙과 같은 이유).
    """
    from rag import expand as expand_mod
    from rag import retrieve as retrieve_mod

    monkeypatch.setattr(expand_mod, "get_client", lambda: None)
    retrieve_mod.reset_cache()
    yield
    retrieve_mod.reset_cache()


def _recall(k: int) -> int:
    return sum(any(g in h["text"] for h in search(q, top_k=k)) for q, g in GOLD)


def test_corpus_has_all_three_guidelines(corpus):
    titles = {c["doc_title"] for c in corpus}
    assert len(titles) == 3, titles
    assert all("시행지침" in t for t in titles)
    assert all(c["source_url"] for c in corpus), "출처 URL 없는 청크가 있으면 인용을 못 한다"


def test_no_chunk_is_an_unsearchable_blob(corpus):
    """4,000자 청크는 서로 다른 질문에 똑같이 걸려서 둘 다 못 맞춘다."""
    huge = [c for c in corpus if len(c["text"]) > 3000]
    assert not huge, [f"{c['section_path']} {len(c['text'])}자" for c in huge]


def test_quoted_statutes_do_not_overwrite_chapter_path(corpus):
    """'제79조' 는 이 지침의 장이 아니라 인용된 법령이다. 장 경로를 덮으면 출처가 거짓이 된다."""
    hijacked = [c for c in corpus if c["section_path"].startswith("제")]
    assert not hijacked, [c["section_path"] for c in hijacked][:5]


def test_recall_at_1_does_not_regress(corpus):
    assert _recall(1) >= MIN_RECALL_AT_1


def test_recall_at_5_does_not_regress(corpus):
    assert _recall(5) >= MIN_RECALL_AT_5


def test_expansion_beats_plain_bm25(corpus):
    """확장을 껐을 때보다 켰을 때가 나아야 한다. 아니면 확장 로직을 지워라."""
    plain = sum(
        any(g in h["text"] for h in search(q, top_k=5, use_expansion=False)) for q, g in GOLD
    )
    assert _recall(5) > plain, f"확장 {_recall(5)} vs 단독 {plain}"


def test_expansion_adds_few_discriminative_terms(corpus):
    """확장어를 쏟아부으면 원 질의가 희석된다. 상한을 지키는지 본다."""
    for q, _ in GOLD:
        assert len(expand(q, use_llm=False).added) <= 2


def test_index_is_built_on_demand_when_missing(tmp_path, monkeypatch):
    """클론한 사람이 ingest 를 안 돌려도 제도 근거가 동작해야 한다.

    색인은 생성물이라 커밋하지 않는다. 그런데 없을 때 조용히 '근거 없음' 이 되면
    기능이 없는 것과 설정이 덜 된 것을 화면에서 구분할 수 없다.
    """
    from rag import ingest

    corpus = tmp_path / "corpus"
    corpus.mkdir()
    (corpus / "doc.txt").write_text(
        "# 시험 지침 | 2026 | https://example.test\n"
        "Ⅰ. 총칙\n1. 목적\n이 지침은 시험을 목적으로 한다.\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(ingest, "CORPUS_DIR", corpus)
    monkeypatch.setattr(ingest, "INDEX_PATH", corpus / "index.jsonl")

    assert not (corpus / "index.jsonl").exists()
    rows = ingest.load_index()
    assert rows, "색인이 없으면 원문에서 만들어야 한다"
    assert (corpus / "index.jsonl").exists()


def test_no_corpus_means_no_answer(tmp_path, monkeypatch):
    """원문까지 없으면 그때는 진짜로 근거가 없는 것이다 — 지어내지 않는다."""
    from rag import ingest

    empty = tmp_path / "empty"
    empty.mkdir()
    monkeypatch.setattr(ingest, "CORPUS_DIR", empty)
    monkeypatch.setattr(ingest, "INDEX_PATH", empty / "index.jsonl")
    assert ingest.load_index() == []


# ── 질의 확장 가드 (2026-09-01 사고) ──────────────────────────────────────
# 키를 켜자 recall@1 이 6→5→4 로 떨어졌다. 원인 두 가지가 겹쳤다.
#   ① MAX_ADDED 상한이 용어집 경로에만 걸려 있고 LLM 경로엔 배선되지 않았다 (10개 부착)
#   ② _most_discriminative 가 문서빈도 오름차순으로 고르는데, 코퍼스에 없는 조어는
#      df=0 이라 '가장 드문 말'로 뽑혀 노이즈가 1순위로 선택됐다 ('만세')
# 둘 다 고쳤고, 아래가 재발을 막는다.

def test_expansion_respects_max_added():
    """어느 경로든 확장어 상한을 넘지 않는다."""
    from rag.expand import MAX_ADDED, expand

    for q, _ in GOLD:
        assert len(expand(q).added) <= MAX_ADDED, q


def test_expansion_never_adds_terms_absent_from_corpus():
    """코퍼스에 없는 말은 붙이지 않는다 — df=0 이라 노이즈가 최우선 선택된다."""
    from rag.expand import expand
    from rag.retrieve import document_frequency

    for q, _ in GOLD:
        for w in expand(q).added:
            assert document_frequency(w) > 0, f"{q}: 코퍼스에 없는 확장어 {w!r}"


def test_llm_output_is_filtered_not_trusted(monkeypatch):
    """LLM 이 낸 확장어를 그대로 믿지 않는다 — 상한과 코퍼스 존재 검사를 통과한 것만 쓴다.

    실제 모델을 부르지 않는다(비결정적·유료). 나쁜 출력을 **가짜 응답**으로 주입해
    걸러지는지만 본다. 이번 사고의 두 원인을 그대로 재현한 입력이다:
    조어('만세'·'만18세이상')와 과다 부착(10개).
    """
    from rag import expand as expand_mod

    BAD = "지원대상 자격요건 연령 만18세이상 만40세미만 사업신청자격 연령기준 신청자격 만세 선정기준"

    class _Msg:
        content = [type("B", (), {"type": "text", "text": BAD})()]

    class _FakeClient:
        class messages:
            @staticmethod
            def create(**_):
                return _Msg()

    monkeypatch.setattr(expand_mod, "get_client", lambda: _FakeClient())
    from rag.retrieve import document_frequency

    e = expand_mod.expand("지원 자격 나이 제한")
    assert e.method == "llm"
    assert len(e.added) <= expand_mod.MAX_ADDED, f"상한 초과: {e.added}"
    for w in e.added:
        assert document_frequency(w) > 0, f"코퍼스에 없는 확장어가 통과했다: {w!r}"
