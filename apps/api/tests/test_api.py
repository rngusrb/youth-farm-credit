"""API 계약 테스트 — 명세 §5 응답 형태."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

CASE_A = {
    "crop_id": "strawberry_hydro",
    "pyeong": 1000,
    "living_cost": 24000000,
    "other_debt_service": 0,
    "requested_principal": 500000000,
    "product_id": "successor_farmer",
}


def test_health():
    assert client.get("/health").json()["status"] == "ok"


def test_diagnose_matches_spec_shape():
    r = client.post("/api/v1/diagnose", json=CASE_A)
    assert r.status_code == 200
    d = r.json()
    assert d["diagnosis_id"].startswith("dg_")
    # 명세 §5 의 세 키는 그대로 두고, 위험기반 한도를 덧붙였다.
    assert {"available", "recommended", "gap"} <= set(d["limits"])
    assert d["limits"]["risk_based"] <= d["limits"]["available"]
    assert d["limits"]["available"] == 500_000_000
    assert d["income"]["annual"] == pytest.approx(48_500_000, rel=0.01)
    assert d["sigma_source"] in ("MEASURED", "PARTIAL", "ASSUMED", "PERSONAL")
    assert 0.05 < d["sigma"] < 0.8
    assert d["scenarios"]["at_available"]["first_risk_year"] == 6
    assert len(d["schedule"]) == 25
    assert "대출 심사 결과" in d["disclaimer"]


def test_diagnose_id_is_shareable():
    created = client.post("/api/v1/diagnose", json=CASE_A).json()
    fetched = client.get(f"/api/v1/diagnose/{created['diagnosis_id']}").json()
    assert fetched["limits"] == created["limits"]
    assert fetched["scenarios"] == created["scenarios"]


def test_diagnose_rejects_unknown_crop():
    bad = dict(CASE_A, crop_id="durian")
    assert client.post("/api/v1/diagnose", json=bad).status_code == 422


def test_diagnose_rejects_bad_id():
    assert client.get("/api/v1/diagnose/not-an-id").status_code == 400


def test_extract_blocks_calculation_when_slot_missing():
    r = client.post(
        "/api/v1/extract",
        json={"text": "부모님 하우스 물려받아서 딸기 해보려는데 1000평쯤 되고 대출 얼마나 받을 수 있나요"},
    ).json()
    assert r["slots"]["crop_id"] == "strawberry_hydro"
    assert r["slots"]["pyeong"] == 1000
    assert r["slots"]["succession"] is True
    assert r["slots"]["living_cost"] is None       # 임의로 채우지 않는다
    assert r["missing_required"] == ["living_cost"]
    assert r["followup_question"]


def test_extract_never_invents_values():
    r = client.post("/api/v1/extract", json={"text": "안녕하세요"}).json()
    assert all(v is None for v in r["slots"].values())
    assert r["defaults_applied"] == []


def test_extract_unit_conversion():
    r = client.post("/api/v1/extract", json={"text": "딸기 수경 1ha 생활비 연 2400만원"}).json()
    assert r["slots"]["pyeong"] == pytest.approx(3025, rel=0.001)
    assert r["slots"]["living_cost"] == 24_000_000


def test_explain_numbers_are_subset_of_diagnose():
    from llm.verify import allowed_forms, collect_numbers

    d = client.post("/api/v1/diagnose", json=CASE_A).json()
    e = client.post("/api/v1/explain", json={"diagnosis": d}).json()
    forms = allowed_forms(collect_numbers(d))
    for n in e["numbers_used"]:
        assert any(abs(n - f) <= max(abs(f) * 0.005, 0.05) for f in forms), n
    assert e["dropped_sentences"] == []
    assert e["headline"] and e["body"] and e["actions"]


def test_explain_rejects_partial_payload():
    r = client.post("/api/v1/explain", json={"diagnosis": {"foo": 1}})
    assert r.status_code == 422


def test_regulation_blocks_uncited_answer():
    r = client.post(
        "/api/v1/regulation/ask", json={"question": "직장 다니면서 신청할 수 있나요?"}
    ).json()
    if not r["citations"]:
        assert r["answer"] == "확인된 근거를 찾지 못했습니다"
        assert r["confidence"] == "none"
    else:
        assert all(c["text"] for c in r["citations"])
