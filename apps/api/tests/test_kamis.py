"""KAMIS 클라이언트 — 명세(데이터 15156057 첨부 xlsx)에 적힌 계약을 지키는지.

실제 API 는 인증키가 있어야 하므로 여기서는 네트워크를 타지 않는다. 명세에 정의된
응답 모양과 오류코드를 그대로 재현해 파서·집계·오류처리를 검증한다.
"""
from __future__ import annotations

import json
from datetime import date

import pytest

from engine.params import get_crop
from stats import kamis


def item(day: str, price: str, market: str = "서울", kg: str | None = None) -> dict:
    """명세의 item 객체 그대로."""
    return {
        "exmn_ymd": day,
        "se_cd": "02",
        "se_nm": "중도매",
        "ctgry_cd": "200",
        "ctgry_nm": "채소류",
        "item_cd": "226",
        "item_nm": "딸기",
        "vrty_cd": "00",
        "vrty_nm": "딸기",
        "grd_cd": "04",
        "grd_nm": "상품",
        "sgg_cd": "1101",
        "sgg_nm": "서울",
        "unit": "kg",
        "unit_sz": "2",
        "mrkt_cd": "0110211",
        "mrkt_nm": market,
        "exmn_dd_prc": price,
        "exmn_dd_cnvs_prc": kg if kg is not None else price,
        "orgnl_reg_dt": f"{day}120000",
    }


def envelope(items: list[dict], total: int | None = None, result_code: str = "00") -> dict:
    return {
        "response": {
            "header": {"resultCode": result_code, "resultMsg": "NORMAL SERVICE."},
            "body": {
                "dataType": "JSON",
                "numOfRows": kamis.MAX_ROWS,
                "pageNo": 1,
                "totalCount": total if total is not None else len(items),
                "items": {"item": items},
            },
        }
    }


@pytest.fixture
def key(monkeypatch):
    monkeypatch.setenv("DATA_GO_KR_SERVICE_KEY", "test-key")


def stub(monkeypatch, payloads: list[dict]):
    """_request 를 순서대로 응답을 돌려주는 스텁으로 바꾸고 호출 기록을 남긴다."""
    calls: list[dict] = []

    def fake(params):
        calls.append(params)
        return payloads[min(len(calls) - 1, len(payloads) - 1)]

    monkeypatch.setattr(kamis, "_request", fake)
    return calls


# ── 코드표 ───────────────────────────────────────────────────
def test_code_tables_loaded():
    c = kamis.codes()
    assert c["spec"]["url"] == kamis.BASE_URL
    assert c["spec"]["date_format"] == "YYYYMMDD"
    assert len(c["item"]) > 100


def test_kamis_mappings_point_at_real_item_codes():
    """매핑이 있는 작목은 코드표에 실제로 존재해야 한다.

    없는 작목도 있다 — KAMIS 에 중도매 시세가 없거나(가지) 품목 자체가 없다(장미,
    엽채류 일부). 확실하지 않을 때 매핑을 지어내면 엉뚱한 시세를 가져오므로,
    비워 두는 것이 맞다.
    """
    from engine.params import crops

    table = {(i["ctgry_cd"], i["code"]): i["name"] for i in kamis.codes()["item"]}
    mapped = 0
    for crop in crops().values():
        if not crop.kamis:
            continue
        pair = (crop.kamis["ctgry_cd"], crop.kamis["item_cd"])
        assert pair in table, f"{crop.id} → {pair} 가 코드표에 없음"
        mapped += 1
    assert mapped >= len(crops()) * 0.5, "절반 이상은 매핑돼야 교차검증이 의미 있다"


def test_strawberry_maps_to_item_226():
    assert get_crop("strawberry_hydro").kamis["item_cd"] == "226"
    assert get_crop("spinach").kamis["item_cd"] == "213"


# ── 요청 조립 ────────────────────────────────────────────────
def test_request_uses_spec_parameter_names(key, monkeypatch):
    calls = stub(monkeypatch, [envelope([item("20240102", "12000")])])
    kamis.fetch_prices("strawberry_hydro", date(2024, 1, 1), date(2024, 1, 31))

    p = calls[0]
    assert p["cond[exmn_ymd::GTE]"] == "20240101"   # YYYYMMDD
    assert p["cond[exmn_ymd::LTE]"] == "20240131"
    assert p["cond[ctgry_cd::EQ]"] == "200"
    assert p["cond[item_cd::EQ]"] == "226"
    assert p["cond[se_cd::EQ]"] == "02"
    assert p["cond[grd_cd::EQ]"] == "04"
    assert p["returnType"] == "JSON"
    assert p["numOfRows"] == 1000                   # 명세상 최대값
    assert p["serviceKey"] == "test-key"


def test_optional_variety_is_omitted_when_null(key, monkeypatch):
    """장미는 품종이 11종이라 vrty_cd 가 null — 파라미터를 아예 빼야 전체가 잡힌다."""
    calls = stub(monkeypatch, [envelope([])])
    kamis.fetch_prices("rose", date(2024, 1, 1), date(2024, 1, 31))
    assert "cond[vrty_cd::EQ]" not in calls[0]
    assert calls[0]["cond[ctgry_cd::EQ]"] == "300"


def test_market_filter_is_passed_through(key, monkeypatch):
    calls = stub(monkeypatch, [envelope([])])
    kamis.fetch_prices("strawberry_hydro", date(2024, 1, 1), date(2024, 1, 2),
                       market_code="0110211")
    assert calls[0]["cond[mrkt_cd::EQ]"] == "0110211"


def test_pagination_walks_until_total_is_covered(key, monkeypatch):
    page = [item("2024010%d" % (i % 9 + 1), "10000") for i in range(1000)]
    calls = stub(monkeypatch, [envelope(page, total=2500)])
    rows = kamis.fetch_prices("strawberry_hydro", date(2024, 1, 1), date(2024, 12, 31))
    assert [c["pageNo"] for c in calls] == [1, 2, 3]
    assert len(rows) == 3000


def test_stops_early_on_empty_page(key, monkeypatch):
    calls = stub(monkeypatch, [envelope([], total=99999)])
    assert kamis.fetch_prices("strawberry_hydro", date(2024, 1, 1), date(2024, 1, 2)) == []
    assert len(calls) == 1


# ── 파싱 ─────────────────────────────────────────────────────
def test_parses_documented_fields():
    (row,) = kamis.parse_rows([item("20240115", "13,500", market="가락도매", kg="6750")])
    assert row.date == "20240115"
    assert row.price == 13500.0        # 천단위 구분자 처리
    assert row.price_per_kg == 6750.0
    assert row.market == "가락도매"
    assert row.unit == "2kg"


def test_drops_unusable_rows():
    """결측·0·비숫자는 버린다. 로그수익률에서 터지지 않게 하는 방어선."""
    rows = kamis.parse_rows([
        item("20240101", "10000"),
        item("20240102", ""),
        item("20240103", "0"),
        item("20240104", "-"),
        item("20240105", "11000"),
    ])
    assert [r.date for r in rows] == ["20240101", "20240105"]


def test_single_item_object_is_accepted(key, monkeypatch):
    """결과가 1건이면 배열이 아니라 객체로 오는 포털 관례를 흡수한다."""
    payload = envelope([])
    payload["response"]["body"]["items"]["item"] = item("20240101", "9000")
    payload["response"]["body"]["totalCount"] = 1
    stub(monkeypatch, [payload])
    rows = kamis.fetch_prices("strawberry_hydro", date(2024, 1, 1), date(2024, 1, 2))
    assert len(rows) == 1


# ── 집계 ─────────────────────────────────────────────────────
def test_daily_average_collapses_markets():
    """같은 날 여러 시장 관측을 평균내지 않으면 시장 구성 변화가 변동성으로 잡힌다."""
    rows = kamis.parse_rows([
        item("20240101", "10000", market="서울", kg="10000"),
        item("20240101", "12000", market="부산", kg="12000"),
        item("20240102", "11000", market="서울", kg="11000"),
    ])
    assert kamis.daily_national_average(rows) == [("20240101", 11000.0), ("20240102", 11000.0)]


def test_daily_average_prefers_kg_converted_price():
    rows = kamis.parse_rows([item("20240101", "20000", kg="10000")])
    assert kamis.daily_national_average(rows, use_kg=True)[0][1] == 10000.0
    assert kamis.daily_national_average(rows, use_kg=False)[0][1] == 20000.0


# ── 오류 처리 ────────────────────────────────────────────────
def test_missing_key_explains_how_to_get_one(monkeypatch):
    monkeypatch.delenv("DATA_GO_KR_SERVICE_KEY", raising=False)
    with pytest.raises(kamis.KamisError, match="활용신청"):
        kamis.service_key()


def test_documented_error_codes_surface(key, monkeypatch):
    monkeypatch.setattr(
        kamis, "_request",
        lambda params: (_ for _ in ()).throw(
            kamis.KamisError("resultCode=-10 (트래픽 허용 횟수를 초과하였습니다.)")
        ),
    )
    with pytest.raises(kamis.KamisError, match="트래픽"):
        kamis.fetch_prices("strawberry_hydro", date(2024, 1, 1), date(2024, 1, 2))


def test_error_code_table_matches_spec():
    assert kamis.ERROR_CODES["-10"].startswith("트래픽")
    assert set(kamis.ERROR_CODES) == {"-1", "-3", "-5", "-10"}


# ── 수집 → 추정 연결 ─────────────────────────────────────────
def test_collected_series_feeds_the_estimator(key, monkeypatch):
    """API 응답에서 σ 추정까지 한 줄로 이어지는지 확인한다."""
    import numpy as np

    from stats.volatility import estimate_from_price_series

    rng = np.random.default_rng(0)
    prices = 10000 * np.exp(np.cumsum(rng.normal(0, 0.30 / np.sqrt(250), 750)))
    items = [item(f"2024{i:04d}", f"{p:.0f}") for i, p in enumerate(prices, 1)]
    stub(monkeypatch, [envelope(items)])

    rows = kamis.fetch_prices("strawberry_hydro", date(2022, 1, 1), date(2024, 12, 31))
    series = [v for _, v in kamis.daily_national_average(rows)]
    est = estimate_from_price_series(np.array(series), periods_per_year=250,
                                     quantity_elasticity=-0.5)
    assert est.sigma == pytest.approx(0.15, abs=0.03)   # 가격 0.30 → 소득 0.15
    assert est.as_crop_fields()["sigma_source"] == "MEASURED"


# ── 게이트웨이 봉투 (실제 서버에서 관측한 형태) ──────────────
GATEWAY_403 = {
    "OpenAPI_ServiceResponse": {
        "cmmMsgHeader": {
            "errMsg": "SERVICE_KEY_IS_NOT_REGISTERED_ERROR",
            "returnAuthMsg": "등록되지 않은 서비스키",
            "returnReasonCode": "30",
        }
    }
}


def test_gateway_envelope_is_decoded_not_swallowed():
    """포털 인증 실패는 명세의 resultCode 가 아니라 별도 봉투로 온다.
    2026-08 실제 호출로 확인한 응답을 그대로 넣어 회귀를 막는다."""
    with pytest.raises(kamis.KamisError) as e:
        kamis._raise_if_gateway_error(GATEWAY_403)
    assert "30" in str(e.value)
    assert "등록되지 않은 서비스키" in str(e.value)
    assert "활용신청" in str(e.value)


def test_normal_payload_passes_gateway_check():
    kamis._raise_if_gateway_error(envelope([item("20240101", "1000")]))  # 예외 없음


def test_gateway_codes_cover_the_documented_table():
    for code in ("01", "04", "05", "10", "12", "20", "22", "23", "29", "30", "31"):
        assert code in kamis.GATEWAY_CODES


def test_quota_exceeded_is_explained():
    payload = {
        "OpenAPI_ServiceResponse": {
            "cmmMsgHeader": {
                "errMsg": "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR",
                "returnAuthMsg": "서비스 요청제한횟수 초과",
                "returnReasonCode": "22",
            }
        }
    }
    with pytest.raises(kamis.KamisError, match="10,000"):
        kamis._raise_if_gateway_error(payload)


def test_service_level_error_code_still_handled(key, monkeypatch):
    """게이트웨이는 통과했지만 서비스가 오류를 낸 경우."""
    import json as _json

    class FakeResp:
        def __init__(self, body):
            self._b = body.encode()
        def read(self):
            return self._b
        def __enter__(self):
            return self
        def __exit__(self, *a):
            return False

    bad = _json.dumps(envelope([], result_code="-10"))
    monkeypatch.setattr(kamis.urllib.request, "urlopen", lambda url, timeout=30: FakeResp(bad))
    with pytest.raises(kamis.KamisError, match="트래픽"):
        kamis._request({"serviceKey": "x"})
