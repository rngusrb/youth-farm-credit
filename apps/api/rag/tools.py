"""rag/tools.py — 제도 검색을 도구로 노출한다 (adapters).

엔진 도구(`engine/tools.py`)와 같은 계약(ToolSpec)을 쓴다. Planner 는 어느 레이어의
도구인지 모른 채 이름과 인자만 고른다.

`returns` 가 비어 있는 이유: 이 도구는 수치를 만들지 않는다. 조항 원문을 돌려줄 뿐이라
Verifier 가 대조할 좌표가 없다. 대신 **인용이 없으면 답하지 않는 것**이 이 도구의 계약이다.
"""
from __future__ import annotations

from engine.tools import ToolSpec

from .answer import ask as _ask
from .eligibility import requirements as _requirements


def _t_search_regulation(question: str, **_) -> dict:
    return _ask(question)


def _t_eligibility(product_id: str | None = None, **_) -> dict:
    from engine.params import get_product, products

    if product_id:
        targets = [get_product(product_id)]
    else:
        targets = list(products().values())
    return {"products": [{"id": p.id, "requirements": _requirements(p)} for p in targets]}


RAG_TOOLS: dict[str, ToolSpec] = {
    t.name: t for t in (
        ToolSpec(
            name="search_regulation",
            summary="농림축산식품부 시행지침에서 질문과 관련된 조항을 찾아 원문 인용과 함께 답한다",
            required=("question",),
            fn=_t_search_regulation,
        ),
        ToolSpec(
            name="eligibility",
            summary="정책자금별 지원 요건과 근거 조항을 돌려준다 (자격을 판정하지 않는다)",
            required=(),
            optional=("product_id",),
            fn=_t_eligibility,
        ),
    )
}
