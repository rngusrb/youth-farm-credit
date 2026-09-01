"""tests/test_prescribe.py — benchmark(평균 대비)와 Advisor(신청서 초안)

## 이 파일이 지키는 두 가지

1. **실적이 없으면 비교하지 않는다.** 추정치(작목평균×면적)를 평균과 견주면 언제나
   100%가 나온다 — 자기 자신과 비교하는 것이라 뜻이 없다. 그럴듯한 숫자가 나오므로
   더 위험하다.
2. **초안의 수치는 전부 도구 값이다.** 신청서에 들어갈 숫자가 틀리면 제일 크게 다친다.
   실제 모델은 부르지 않고 가짜 응답으로 검증만 시험한다.
"""
import pytest

from engine.benchmark import MIN_YEARS, benchmark, crop_traits
from engine.diagnose import DiagnoseInput, diagnose
from engine.levers import solve_for
from llm import advisor as A

CROP = "strawberry_hydro"
INP = DiagnoseInput(crop_id=CROP, pyeong=1300.0, living_cost=30_000_000.0,
                    other_debt_service=5_000_000.0)


@pytest.fixture(scope="module")
def bundle():
    d = diagnose(INP)
    lv = {"target_principal": 280_000_000.0,
          "levers": [vars(l) for l in solve_for(INP, 280_000_000.0)]}
    return d, lv


# ── benchmark ─────────────────────────────────────────────────────────────

@pytest.mark.parametrize("years", [(), (5e7,), (5e7, 4.8e7)])
def test_no_comparison_without_enough_history(years):
    """실적이 부족하면 비교를 만들지 않는다 — 지어낸 100% 를 내놓지 않는다."""
    b = benchmark(CROP, 1300.0, years)
    assert b["comparable"] is False
    assert b["reason"] == "actual_income_required"
    assert "my_income" not in b and "ratio" not in b


def test_crop_traits_available_even_without_history():
    """실적이 없어도 작목 특성은 유효하다 — 그건 준다."""
    t = benchmark(CROP, 1300.0)["crop_traits"]
    assert t["sigma"] > 0
    assert 1 <= t["sigma_rank"] <= t["sigma_total"]
    assert t["cost_ratio"] is not None


def test_comparison_uses_actual_income():
    b = benchmark(CROP, 1300.0, (52e6, 48e6, 55e6))
    assert b["comparable"] is True
    assert b["my_income"] == pytest.approx((52e6 + 48e6 + 55e6) / 3)
    assert b["ratio"] == pytest.approx(b["my_income"] / b["average_income"])
    assert b["years"] == MIN_YEARS


def test_wording_is_crop_average_not_peer_farms():
    """'유사 농가' 라고 말하지 않는다 — 개별 농가 데이터가 없다."""
    note = benchmark(CROP, 1300.0)["note"]
    assert "평균" in note
    assert "유사 농가" not in note


def test_zero_years_are_ignored_not_counted():
    """빈 값(0)을 연수로 세지 않는다."""
    assert benchmark(CROP, 1300.0, (5e7, 0, 0))["comparable"] is False


def test_sigma_rank_is_consistent():
    a, b = crop_traits(CROP), crop_traits(CROP)
    assert a.sigma_rank == b.sigma_rank


# ── Advisor ───────────────────────────────────────────────────────────────

def test_draft_numbers_are_all_from_tools(bundle):
    """초안에 남은 수치는 전부 도구 값이어야 한다."""
    d, lv = bundle
    r = A.draft(d, lv, benchmark(CROP, 1300.0, (52e6, 48e6, 55e6)))
    assert r["numbers_used"]
    assert r["dropped"] == [], f"템플릿 경로에서 버려진 문장이 있다: {r['dropped']}"


def test_draft_drops_fabricated_numbers(bundle, monkeypatch):
    """지어낸 수치가 들어오면 그 문장을 버린다. 실제 모델은 부르지 않는다."""
    from llm.verify import _matches, allowed_forms, collect_numbers

    d, lv = bundle
    # 도구 결과에는 수치와 표기 변형이 수십 개라 아무 숫자나 고르면 우연히 겹친다.
    forms = allowed_forms(collect_numbers({"diagnose": d, "levers": lv}))
    bogus = next(v for v in (77.77, 88.88, 66.66, 55.55, 44.44, 33.33)
                 if not _matches(v, forms))

    class _Msg:
        content = [type("B", (), {"type": "text",
                                  "text": f"권장 차입은 {bogus}억원입니다."})()]

    class _Fake:
        class messages:
            @staticmethod
            def create(**_):
                return _Msg()

    monkeypatch.setattr(A, "get_client", lambda: _Fake())
    r = A.draft(d, lv)
    assert r["method"] == "llm"
    assert any(str(bogus) in s for s in r["dropped"]), f"지어낸 수치가 통과했다: {r['body']}"
    assert str(bogus) not in r["body"]


def test_draft_always_carries_disclaimer(bundle):
    d, lv = bundle
    assert "제출 서류가 아닙니다" in A.draft(d, lv)["disclaimer"]


def test_draft_without_clauses_says_nothing_about_rules(bundle):
    """근거 조항이 없으면 제도 내용을 만들어 쓰지 않는다."""
    d, lv = bundle
    body = A.draft(d, lv, None, [])["body"]
    assert "조항에 규정" not in body


def test_clause_numbers_are_not_parsed_as_figures(bundle):
    """'Ⅱ-2' 의 -2 를 음수로 읽어 문장을 버리지 않는다."""
    d, lv = bundle
    cites = [{"doc": "지침", "section": "Ⅱ-2", "text": "요건"},
             {"doc": "지침", "section": "Ⅲ-1", "text": "요건"}]
    r = A.draft(d, lv, None, cites)
    assert "조항에 규정" in r["body"], f"조항 문장이 버려졌다: {r['dropped']}"


def test_lever_percentage_is_a_tool_value(bundle):
    """문장에 쓰는 감소율(19%)이 도구 출력에 있어야 검증을 통과한다."""
    d, lv = bundle
    for l in lv["levers"]:
        if l["reachable"]:
            assert l["delta_pct"] is not None
            assert l["delta_pct"] == pytest.approx(abs(l["delta_ratio"]) * 100)
