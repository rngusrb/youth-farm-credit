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


def test_explain_numbers_are_subset_of_diagnose(monkeypatch):
    """설명에 남은 수치는 전부 진단 결과의 값이어야 한다.

    ⚠️ 템플릿(결정적) 경로로 고정한다. LLM 경로는 같은 입력에 매번 다른 문장을 내고,
    그중 일부가 검증에서 걸러지는 것은 **정상 동작**이다. 그걸 계약 테스트에서 재면
    회귀인지 그날 모델 기분인지 구분할 수 없고, 매 실행마다 과금된다.
    LLM 이 틀린 수치를 썼을 때 걸러지는지는 아래 스텁 테스트가 본다.
    """
    from llm import narrate as narrate_mod
    from llm.verify import _matches, allowed_forms, collect_numbers

    # narrate 는 `from .client import get_client` 로 이름을 바인딩한다.
    # llm.client 쪽을 패치하면 안 먹는다 — 쓰는 자리를 패치한다.
    monkeypatch.setattr(narrate_mod, "get_client", lambda: None)

    d = client.post("/api/v1/diagnose", json=CASE_A).json()
    e = client.post("/api/v1/explain", json={"diagnosis": d}).json()
    forms = allowed_forms(collect_numbers(d))
    # 허용 판정을 여기서 다시 구현하지 않는다 — 복사본이 갈라지면 검증 구멍을
    # 테스트가 못 잡는다 (실제로 구조 상수 오차 구멍을 이 복사본이 가리고 있었다).
    for n in e["numbers_used"]:
        assert _matches(n, forms), n
    assert e["dropped_sentences"] == [], "템플릿 경로는 버릴 문장이 없어야 한다"
    assert e["headline"] and e["body"] and e["actions"]


def test_explain_drops_fabricated_numbers():
    """지어낸 수치가 들어오면 그 문장을 버리고 **버렸다고 알린다**.

    조용히 통과시키면 이 서비스의 제1원칙('숫자는 LLM 이 만들지 않는다')이
    문장으로만 남는다. 실제 모델을 부르지 않고 검증기만 시험한다.
    """
    from llm.verify import _matches, allowed_forms, collect_numbers, verify_text

    d = client.post("/api/v1/diagnose", json=CASE_A).json()
    forms = allowed_forms(collect_numbers(d))

    # 진단에는 수십 개 수치와 그 표기 변형이 있어 아무 숫자나 고르면 우연히 겹친다.
    # 확실히 허용되지 않는 값을 찾아서 쓴다.
    bogus = next(v for v in (77.77, 88.88, 66.66, 55.55, 44.44) if not _matches(v, forms))
    real = f"권장 차입은 {d['limits']['risk_based'] / 100_000_000:.1f}억원입니다."
    fake = f"권장 차입은 {bogus}억원입니다."

    kept, dropped, used = verify_text(f"{real} {fake}", d)
    assert any(str(bogus) in s for s in dropped), f"지어낸 수치 {bogus} 가 통과했다: {dropped}"
    assert str(bogus) not in kept
    assert used, "검증에 쓰인 수치가 기록돼야 한다"


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
