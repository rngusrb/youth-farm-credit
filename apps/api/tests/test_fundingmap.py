"""25년 자금지도 — 이 서비스가 "key 기능"이라 부르는 화면의 재료.

## 왜 이 파일이 뒤늦게 생겼나

2026-09-02 적대적 리뷰: `funding_map` 이 `annual_income` 을 직접 불러 **실적을 통째로
버리고 있었다.** 실적 9,100만원을 넣은 농가의 진단은 9,100만원인데 자금지도는
6,005만원으로 그렸다. `levers.py` 가 같은 날 고쳐 사고 이력까지 적어 둔 버그를
여기만 안 고친 것이다.

**아무도 못 잡은 이유는 하나다 — 이 모듈에 전용 테스트가 없었다.**
도구 카탈로그 계약 테스트가 호출은 했지만 "어떤 소득으로 계산했는가"는 안 봤다.
"""
from __future__ import annotations

import pytest

from engine.diagnose import DiagnoseInput, diagnose
from engine.fundingmap import funding_map

BASE = dict(crop_id="strawberry_hydro", pyeong=1300.0, living_cost=30_000_000.0)
HISTORY = (90_000_000.0, 95_000_000.0, 88_000_000.0)


def test_uses_same_income_as_diagnosis_when_history_given():
    """실적이 있으면 진단과 **같은 소득**으로 그린다.

    사고 이력 2026-09-02: 여기가 어긋나서 한 농가가 두 개의 '내 소득'을 봤다.
    """
    inp = DiagnoseInput(**BASE, income_history=HISTORY)
    d = diagnose(inp)
    fm = funding_map(inp, d["limits"]["risk_based"])
    assert d["income"]["source"] == "ACTUAL", "전제: 3개년이면 실적을 써야 한다"
    assert fm["income"]["source"] == d["income"]["source"]
    assert fm["income"]["annual"] == pytest.approx(d["income"]["annual"])


def test_falls_back_to_crop_average_without_history():
    """실적이 없으면 작목 통계로 간다. 출처를 반드시 밝힌다."""
    inp = DiagnoseInput(**BASE)
    fm = funding_map(inp, 200_000_000.0)
    assert fm["income"]["source"] == "CROP_AVERAGE"
    assert fm["income"]["annual"] > 0


def test_history_actually_changes_the_map():
    """실적이 결과를 **바꾸는지** 확인한다.

    출처 라벨만 맞고 숫자가 안 바뀌면 배선이 안 된 것이다.
    """
    p = 200_000_000.0
    a = funding_map(DiagnoseInput(**BASE), p)
    b = funding_map(DiagnoseInput(**BASE, income_history=HISTORY), p)
    assert a["years"][0]["capacity"] != b["years"][0]["capacity"]
    assert b["years"][0]["capacity"] > a["years"][0]["capacity"], (
        "실적이 작목평균보다 높은데 상환여력이 늘지 않았다")


def test_grace_end_and_principal_jump_are_consistent():
    """분기점이 실제 상환 스케줄과 맞는지.

    화면이 "6년차부터 4.3배" 라고 말하는 근거가 여기다.
    """
    inp = DiagnoseInput(**BASE)
    fm = funding_map(inp, 300_000_000.0)
    grace = fm["grace_years"]
    years = fm["years"]
    assert all(y["is_grace"] for y in years[:grace])
    assert not years[grace]["is_grace"]
    # 거치 중엔 이자만, 끝나면 원금이 붙어 상환액이 늘어난다
    assert years[grace]["due"] > years[grace - 1]["due"]
    kinds = {m["kind"]: m for m in fm["milestones"]}
    assert kinds["grace_end"]["year"] == grace
    assert kinds["principal_starts"]["year"] == grace + 1


def test_shortfall_prob_is_a_probability():
    inp = DiagnoseInput(**BASE)
    fm = funding_map(inp, 300_000_000.0)
    for y in fm["years"]:
        assert 0.0 <= y["shortfall_prob"] <= 1.0


def test_rejects_nonpositive_principal():
    with pytest.raises(ValueError):
        funding_map(DiagnoseInput(**BASE), 0)


def test_respects_product_choice():
    """상품을 바꾸면 지도의 길이가 바뀐다.

    사고 이력 2026-09-02 (적대적 리뷰 F5): 웹이 `product_id` 를 안 보내 우수후계농
    (10년 상환)을 고른 농가가 **15년짜리 대출을 25년 지도로** 보고 있었다.
    """
    a = funding_map(DiagnoseInput(**BASE, product_id="successor_farmer"), 200_000_000.0)
    b = funding_map(DiagnoseInput(**BASE, product_id="excellent_successor"), 200_000_000.0)
    assert a["term_years"] != b["term_years"], "상품이 달라도 지도 길이가 같다"
    assert b["term_years"] < a["term_years"]
