"""자격 요건은 코퍼스 원문에서만 나온다 (UX-012).

지키려는 것: **근거 조항을 못 찾으면 그 요건은 없는 것으로 친다.**
자격을 잘못 판정하면 받을 수 있는 사람이 포기한다. 그래서 이 서비스는 판정하지
않고 요건과 조문만 낸다 — 그 조문이 진짜여야 의미가 있다.
"""
from dataclasses import replace

import pytest

from engine.params import get_product, products
from rag.eligibility import MAX_QUOTE_CHARS, requirements


def test_후계농_요건이_지침_원문에서_나온다():
    reqs = {r["key"]: r for r in requirements(get_product("successor_farmer"))}
    assert reqs["age"]["quote"].startswith("가. 연령")
    assert "18세" in reqs["age"]["quote"] and "49세" in reqs["age"]["quote"]
    assert reqs["career"]["quote"].startswith("나. 영농경력")
    assert reqs["education"]["quote"].startswith("마. 교육실적")


def test_문서마다_요건이_다르다():
    """우수후계농 지침에는 연령·병역·교육 조항이 아예 없다.

    사고 이력: 후계농의 Ⅱ-1-가~마 를 우수후계농에 그대로 복사해 넣을 뻔했다.
    요건을 코드에 적기 시작하면 이렇게 샌다.
    """
    keys = {r["key"] for r in requirements(get_product("excellent_successor"))}
    assert keys == {"successor_years"}
    assert "age" not in keys


def test_조문을_못_찾으면_요건을_내보내지_않는다():
    """없는 조항 번호를 가리키면 그 요건은 목록에서 빠진다 — 지어내지 않는다."""
    p = get_product("successor_farmer")
    broken = replace(p, eligibility={
        "doc": p.eligibility["doc"],
        "items": [
            {"key": "age", "label": "나이", "section": "Ⅱ-1-가", "check": "self"},
            {"key": "ghost", "label": "없는요건", "section": "Ⅸ-99-없음", "check": "self"},
        ],
    })
    keys = [r["key"] for r in requirements(broken)]
    assert keys == ["age"], f"없는 조항이 목록에 남았다: {keys}"


def test_없는_문서를_가리키면_전부_빠진다():
    p = get_product("successor_farmer")
    broken = replace(p, eligibility={"doc": "있지도 않은 지침", "items": p.eligibility["items"]})
    assert requirements(broken) == []


def test_요건_선언이_없으면_빈_목록():
    p = get_product("successor_farmer")
    assert requirements(replace(p, eligibility=None)) == []


@pytest.mark.parametrize("pid", list(products()))
def test_인용문은_원문_그대로다(pid):
    """요약하거나 다듬지 않는다. 길면 자르되 문장을 바꾸지 않는다."""
    from rag.ingest import load_index

    index = load_index()
    for r in requirements(get_product(pid)):
        hit = [c for c in index
               if c.get("doc_title") == r["document"] and c.get("section_path") == r["section"]
               and c["text"].strip().startswith(r["quote"][:40])]
        assert hit, f"{pid}/{r['key']}: 인용문이 코퍼스에 그대로 있지 않다"
        assert len(r["quote"]) <= MAX_QUOTE_CHARS


def test_수치_요건_기준이_상품마다_다르면_화면이_틀린다():
    """화면은 나이·경력을 **입력 한 벌**로 받아 모든 상품에 함께 댄다.

    지금은 두 상품의 수치 기준이 같아서 맞지만, 기준이 다른 상품
    (청년창업형: 39세·경력 3년)이 붙는 순간 한 입력으로 두 판정을 내게 된다.
    그때 이 테스트가 먼저 깨져서 화면을 상품별 입력으로 바꾸라고 알려준다.
    """
    seen: dict[str, set] = {}
    for p in products().values():
        for r in requirements(p):
            if r["check"] == "self":
                continue
            seen.setdefault(r["key"], set()).add((r["check"], r["min"], r["max"]))
    mixed = {k: v for k, v in seen.items() if len(v) > 1}
    assert not mixed, (
        f"상품마다 기준이 다른 수치 요건이 생겼다: {mixed}. "
        "EligibilityCheck 의 나이·경력 입력을 상품별로 분리할 것."
    )
