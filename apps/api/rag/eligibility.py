"""정책자금 자격 요건을 **코퍼스 원문과 함께** 낸다.

왜 rag/ 에 있나: 요건의 문장은 우리가 쓰는 것이 아니라 시행지침 원문이다.
조문을 못 찾으면 그 요건은 **없는 것으로 취급한다** — 이 파일의 존재 이유다.

원칙 (RAG 와 동일):
- 근거 조항을 못 찾으면 그 요건을 내보내지 않는다. 요약하거나 지어내지 않는다.
- 판정하지 않는다. 이 모듈은 요건과 조문만 내고, 해당 여부의 표현은 화면이 맡는다.

사고 이력(2026-08-28): 우수후계농에 후계농의 Ⅱ-1-가~마(연령·병역·교육)를 그대로
복사해 넣을 뻔했다. 실제로 그 지침에는 그 조항이 **없고** 요건이 「후계농 선정 후
5년 이상」 하나다. 요건을 코드에 적기 시작하면 이렇게 샌다 — 그래서 원문에서 끌어온다.
"""
from __future__ import annotations

from .ingest import load_index

# 조문 하나가 지나치게 길면 화면에서 벽이 된다. 원문을 **자르되 요약하지 않는다.**
#
# 400 자였을 때 영농경력 조항(565자)의 뒤 165자가 잘렸는데, 거기에 독립경영 요건
# (직계존속 임차·공유지분 형태 소유 등)이 들어 있었다. 요건의 일부만 보고 스스로
# 대보면 틀린 결론이 난다. 원문은 접힘 안에 들어가니 길이는 레이아웃 문제가 아니다.
# 지금 코퍼스의 자격 조문 최대 길이는 565자다.
MAX_QUOTE_CHARS = 1200


def _find_clause(doc: str, section: str, contains: str = "") -> dict | None:
    """문서·조항 번호로 원문을 찾는다. 없으면 None — 지어내지 않는다.

    조항 번호만으로는 특정이 안 되는 경우가 있다. 우수후계농 지침의 `Ⅱ-1` 은
    본문 말고도 서식·표 조각이 같은 번호를 달고 있어서, 길이로 고르면
    "1    년차" 같은 표 쪼가리가 뽑힌다. 그럴 때 `contains` 로 좁힌다.
    """
    best: dict | None = None
    for c in load_index():
        if c.get("doc_title") != doc or c.get("section_path") != section:
            continue
        if contains and contains not in c["text"]:
            continue
        # 같은 조항이 여러 조각이면 가장 긴 것(목차 줄이 아니라 본문일 확률이 높다)
        if best is None or len(c["text"]) > len(best["text"]):
            best = c
    return best


def requirements(product: object) -> list[dict]:
    """상품의 자격 요건 + 근거 조항 원문.

    `product.eligibility` 가 없거나 조문을 못 찾으면 그만큼 **빠진 채로** 돌아온다.
    빈 목록이 정상 응답이다 — 호출자는 "요건 없음" 이 아니라 "확인 못 함" 으로 읽어야 한다.
    """
    elig = getattr(product, "eligibility", None)
    if not elig:
        return []
    doc = elig.get("doc") or ""
    out: list[dict] = []
    for item in elig.get("items") or []:
        clause = _find_clause(doc, item.get("section") or "", item.get("contains") or "")
        if clause is None:
            # 조문을 못 찾았다 — 요건을 화면에 올리지 않는다.
            continue
        text = clause["text"].strip()
        out.append({
            "key": item["key"],
            "label": item["label"],
            "check": item.get("check", "self"),
            "min": item.get("min"),
            "max": item.get("max"),
            "document": doc,
            "section": item["section"],
            "quote": text[:MAX_QUOTE_CHARS],
            "quote_truncated": len(text) > MAX_QUOTE_CHARS,
            "source_url": clause.get("source_url"),
        })
    return out
