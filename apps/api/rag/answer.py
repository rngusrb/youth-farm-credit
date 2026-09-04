"""인용 강제 응답.

citations 가 비면 답변을 생성하지 않는다. 추론으로 메우지 않는다(명세 §5).
"""
from __future__ import annotations

import json
import logging

from llm.client import complete, get_client
from llm.verify import numbers_in_text, verify_text

from .retrieve import search

log = logging.getLogger(__name__)

NO_EVIDENCE = "확인된 근거를 찾지 못했습니다"

SYSTEM = """너는 농업 정책자금 지침 안내자다.

절대 규칙:
1. 아래 제공된 발췌문에 적힌 내용만으로 답한다. 발췌문에 없으면 "지침에서 확인되지 않습니다"라고 말한다.
2. 추론으로 요건을 만들어내지 않는다. 금액·기간·비율은 발췌문에 적힌 값만 쓴다.
3. 답변은 3문장 이내. 마지막에 어느 조항을 근거로 삼았는지 밝힌다.
4. 최종 판단은 사업 시행기관에 확인해야 한다는 점을 덧붙인다.

출력은 JSON 한 개: {"answer": "...", "used_sections": ["III-2-나", ...]}"""


def _confidence(hits: list[dict]) -> str:
    if not hits:
        return "none"
    top = hits[0]["score"]
    if top >= 8 and len(hits) >= 2:
        return "high"
    if top >= 4:
        return "medium"
    return "low"


def _citation(hit: dict) -> dict:
    return {
        "doc": hit["doc_title"],
        "section": hit["section_path"],
        "text": hit["text"],  # 청크 원문 그대로. 요약·재작성 금지
        "url": hit.get("source_url"),
        "doc_year": hit.get("doc_year"),
        "region": hit.get("region"),
    }


def _excerpts(hits: list[dict]) -> str:
    """LLM 에 넘길 발췌문. **검증의 허용 집합도 이 문자열에서 뽑는다.**

    사고 이력 2026-09-02 (적대적 리뷰 F2): 허용 집합을 `h["text"]` 에서만 뽑았더니,
    LLM 이 본 조항 번호·문서 제목의 숫자가 빠졌다. SYSTEM 이 "어느 조항을 근거로
    삼았는지 밝혀라" 고 시켜 놓고, 시키는 대로 쓴 문장을 **'2026' 때문에 통째로
    지웠다.** LLM 이 본 것과 검증이 보는 것이 다르면 그건 검증이 아니라 사고다.
    """
    return "\n\n".join(
        f"[{h['section_path']}] ({h['doc_title']})\n{h['text']}" for h in hits
    )


def _llm_answer(question: str, hits: list[dict]) -> str | None:
    client = get_client()
    if client is None:
        return None
    excerpts = _excerpts(hits)
    try:
        text = complete(
            f"질문: {question}\n\n발췌문:\n{excerpts}",
            client=client, max_tokens=2000, purpose="제도답변",
            system=SYSTEM,
            output_config={
                "effort": "low",
                "format": {
                    "type": "json_schema",
                    "schema": {
                        "type": "object",
                        "properties": {
                            "answer": {"type": "string"},
                            "used_sections": {"type": "array", "items": {"type": "string"}},
                        },
                        "required": ["answer", "used_sections"],
                        "additionalProperties": False,
                    },
                },
            },
        )
        return json.loads(text)["answer"]
    except Exception as exc:
        log.warning("LLM 지침 응답 실패, 발췌 그대로 반환: %s", exc)
        return None


def citations_for(question: str, context: dict | None = None) -> list[dict]:
    """조항 인용만 찾는다. **답변 문장은 만들지 않는다.**

    사고 이력 2026-09-02: 처방(`/api/v1/prescribe`)이 `ask()` 를 부르고 `citations`
    만 꺼내 쓰고 있었다. 답변 문장은 버리는데 그걸 만드느라 **9초**가 갔다.
    처방 전체가 40초 걸리는데 그중 9초가 아무도 안 읽는 문장이었다.

    인용은 검색(retrieval)이 만든다 — LLM 이 만드는 게 아니다. 그래서 그냥 뺀다.
    """
    return [_citation(h) for h in search(question, context)]


def ask(question: str, context: dict | None = None) -> dict:
    hits = search(question, context)
    if not hits:
        # dropped 를 여기서 빼면 호출부가 키 유무로 갈린다 — 응답 모양은 하나여야 한다
        return {"answer": NO_EVIDENCE, "citations": [], "confidence": "none", "dropped": []}

    answer = _llm_answer(question, hits)
    dropped: list[str] = []
    if answer is not None:
        # 발췌문에 없는 수치를 쓴 문장은 뺀다. 여기까지는 "인용이 비지 않는 것" 만
        # 강제됐고 **문장 속 숫자는 아무도 안 봤다** — 제도 답변의 금액·기간·비율이
        # 검증 없이 화면까지 갔다. (적대적 리뷰 H3, 2026-09-02)
        allowed = numbers_in_text(_excerpts(hits))
        answer, dropped, _used = verify_text(answer, sorted(allowed))
        if not answer.strip():
            log.warning("제도 답변의 모든 문장이 발췌문과 어긋나 제거됨 — 조항 안내로 대체")
            answer = None
    if answer is None:
        # LLM 이 없으면 문장을 지어내지 않고 가장 관련 높은 조항을 그대로 안내한다.
        top = hits[0]
        answer = (
            f"「{top['doc_title']}」 {top['section_path']} 조항이 이 질문과 가장 가깝습니다. "
            f"아래 인용 원문을 확인해 주세요. 최종 판단은 사업 시행기관에 확인해야 합니다."
        )

    return {
        "answer": answer,
        "citations": [_citation(h) for h in hits],
        "confidence": _confidence(hits),
        # 몇 문장을 뺐는지 밝힌다 — 조용히 지우면 검증이 있었는지 알 수 없다
        "dropped": dropped,
    }
