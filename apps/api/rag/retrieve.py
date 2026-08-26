"""하이브리드 검색.

한국어 지침 문서에 형태소 분석기 없이 쓰려고 어절 토큰 + 문자 bigram 을 섞은
BM25 를 쓴다. 임베딩 검색은 키가 있을 때만 얹는다(없으면 BM25 단독).
"""
from __future__ import annotations

import math
import re
from collections import Counter
from functools import lru_cache

from .expand import expand
from .ingest import load_index

_WORD = re.compile(r"[가-힣]+|[A-Za-z]+|\d+")
_STOP = {"에서", "하는", "합니다", "있는", "경우", "대한", "위한", "그리고", "또는"}

K1 = 1.5
B = 0.75


def tokenize(text: str) -> list[str]:
    tokens: list[str] = []
    for word in _WORD.findall(text.lower()):
        if word in _STOP:
            continue
        tokens.append(word)
        if len(word) > 2:
            # 조사 분리를 대신하는 문자 bigram
            tokens += [word[i : i + 2] for i in range(len(word) - 1)]
    return tokens


class Bm25Index:
    def __init__(self, docs: list[dict]):
        self.docs = docs
        self.tokens = [tokenize(f"{d['section_path']} {d['doc_title']} {d['text']}") for d in docs]
        self.lengths = [len(t) for t in self.tokens]
        self.avg_len = (sum(self.lengths) / len(self.lengths)) if self.lengths else 0.0
        self.freqs = [Counter(t) for t in self.tokens]
        self.df: Counter[str] = Counter()
        for counter in self.freqs:
            self.df.update(counter.keys())
        self.n = len(docs)

    def _idf(self, term: str) -> float:
        df = self.df.get(term, 0)
        if df == 0:
            return 0.0
        return math.log(1 + (self.n - df + 0.5) / (df + 0.5))

    def search(self, query: str, top_k: int = 5) -> list[tuple[float, dict]]:
        if self.n == 0:
            return []
        q = tokenize(query)
        scored: list[tuple[float, dict]] = []
        for i, freq in enumerate(self.freqs):
            score = 0.0
            for term in q:
                tf = freq.get(term, 0)
                if not tf:
                    continue
                denom = tf + K1 * (1 - B + B * self.lengths[i] / (self.avg_len or 1))
                score += self._idf(term) * tf * (K1 + 1) / denom
            if score > 0:
                scored.append((score, self.docs[i]))
        scored.sort(key=lambda x: (-x[0], x[1]["chunk_id"]))
        return scored[:top_k]


@lru_cache(maxsize=1)
def _index() -> Bm25Index:
    return Bm25Index(load_index())


def document_frequency(term: str) -> int:
    """term 을 포함한 청크 수. 질의 확장이 변별력을 재는 데 쓴다."""
    toks = tokenize(term)
    if not toks:
        return 10**9
    return min(sum(1 for f in _index().freqs if t in f) for t in toks)


def reset_cache() -> None:
    _index.cache_clear()


# RRF 상수. 표준값 60. 낮추면 1위 쏠림이 커진다.
RRF_K = 60


def _rrf(rankings: list[list[tuple[float, dict]]]) -> list[tuple[float, dict]]:
    """Reciprocal Rank Fusion — 여러 질의의 순위를 합친다.

    확장어를 원 질의에 **덧붙이면** 원 질의의 흔한 단어('지원', '자격')가
    계속 방해한다. 확장 질의를 따로 돌려 순위만 합치면 그 간섭이 사라진다.
    실측: '지원 자격 나이 제한' 이 덧붙이기로는 10위 밖, RRF 로는 상위권.
    """
    fused: dict[str, float] = {}
    keep: dict[str, dict] = {}
    for hits in rankings:
        for rank, (_score, doc) in enumerate(hits):
            key = doc["chunk_id"]
            fused[key] = fused.get(key, 0.0) + 1.0 / (RRF_K + rank + 1)
            keep[key] = doc
    return sorted(((v, keep[k]) for k, v in fused.items()), key=lambda x: -x[0])


def search(query: str, context: dict | None = None, top_k: int = 5,
           use_expansion: bool = True) -> list[dict]:
    """상위 청크 목록. score 와 확장 방식을 함께 담아 돌려준다."""
    index = _index()
    base = query
    if context:
        # 작목·승계 여부 같은 맥락은 질의 확장에만 쓰고 답변 근거로는 쓰지 않는다.
        extra = " ".join(str(v) for v in context.values() if isinstance(v, (str, int)))
        base = f"{query} {extra}".strip()

    exp = expand(query, use_llm=use_expansion) if use_expansion else None
    pool = top_k * 4  # 융합 전에는 넉넉히 뽑는다
    rankings = [index.search(base, top_k=pool)]
    if exp and exp.added:
        rankings.append(index.search(" ".join(exp.added), top_k=pool))

    hits = _rrf(rankings) if len(rankings) > 1 else rankings[0]
    if not hits:
        return []
    top = hits[0][0]
    out = []
    for score, doc in hits[:top_k]:
        # 최상위 대비 지나치게 약한 근거는 인용하지 않는다.
        if score < top * 0.35:
            continue
        item = dict(doc)
        item["score"] = round(score, 4)
        item["expansion"] = exp.method if exp else "none"
        out.append(item)
    return out
