"""하이브리드 검색.

한국어 지침 문서에 형태소 분석기 없이 쓰려고 어절 토큰 + 문자 bigram 을 섞은
BM25 를 쓴다. 임베딩 검색은 키가 있을 때만 얹는다(없으면 BM25 단독).
"""
from __future__ import annotations

import math
import re
from collections import Counter
from functools import lru_cache

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


def reset_cache() -> None:
    _index.cache_clear()


def search(query: str, context: dict | None = None, top_k: int = 5) -> list[dict]:
    """상위 청크 목록. score 를 함께 담아 돌려준다."""
    index = _index()
    enriched = query
    if context:
        # 작목·승계 여부 같은 맥락은 질의 확장에만 쓰고 답변 근거로는 쓰지 않는다.
        extra = " ".join(str(v) for v in context.values() if isinstance(v, (str, int)))
        enriched = f"{query} {extra}".strip()

    hits = index.search(enriched, top_k=top_k)
    if not hits:
        return []
    top = hits[0][0]
    out = []
    for score, doc in hits:
        # 최상위 대비 지나치게 약한 근거는 인용하지 않는다.
        if score < top * 0.35:
            continue
        item = dict(doc)
        item["score"] = round(score, 4)
        out.append(item)
    return out
