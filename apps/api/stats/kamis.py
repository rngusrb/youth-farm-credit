"""공공데이터포털 — 한국농수산식품유통공사 일별 도·소매 가격정보 클라이언트.

    GET https://apis.data.go.kr/B552845/perDay/price

파라미터·응답 필드는 데이터 15156057 의 첨부 명세(『일별 도,소매 가격정보 API
명세.xlsx』)를 그대로 따랐다. 코드표는 data/kamis_codes.json 에 추출해 두었고,
작목별 매핑은 crops.json 의 `kamis` 필드에 있다.

인증키는 환경변수 DATA_GO_KR_SERVICE_KEY 로만 받는다. 코드나 저장소에 넣지 않는다.
"""
from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date, timedelta
from functools import lru_cache

from engine.params import DATA_DIR, get_crop

log = logging.getLogger(__name__)

BASE_URL = "https://apis.data.go.kr/B552845/perDay/price"
RECENT_URL = "https://apis.data.go.kr/B552845/recent/price"
MAX_ROWS = 1000
DATE_FMT = "%Y%m%d"

# 서비스 자체가 돌려주는 오류코드 (response.header.resultCode)
ERROR_CODES = {
    "-1": "시스템 내부 오류가 발생하였습니다.",
    "-3": "등록되지 않은 서비스 입니다.",
    "-5": "API 서버 오류가 발생하였습니다.",
    "-10": "트래픽 허용 횟수를 초과하였습니다.",
}

# 포털 게이트웨이가 서비스 앞단에서 막을 때는 봉투 자체가 다르다.
#   {"OpenAPI_ServiceResponse": {"cmmMsgHeader": {"errMsg", "returnAuthMsg", "returnReasonCode"}}}
# HTTP 403 과 함께 오므로 명세의 resultCode 경로로는 절대 잡히지 않는다.
GATEWAY_CODES = {
    "01": "GW 내부 오류. 잠시 후 다시 호출해 보세요.",
    "04": "허용되지 않은 HTTP 요청이거나 응답 처리 실패. 호출 URL 을 확인하세요.",
    "05": "기관 API 연결 실패 또는 응답 대기시간 초과.",
    "10": "요청 파라미터의 값이나 형식이 올바르지 않습니다.",
    "12": "요청한 오픈API 서비스가 존재하지 않거나 폐기되었습니다.",
    "20": "이용 권한이 확인되지 않습니다. 활용신청 승인 상태를 확인하세요.",
    "22": "일일 호출 허용량(개발계정 10,000건)을 초과했습니다.",
    "23": "초당 호출 허용량을 초과했습니다. 잠시 후 다시 호출하세요.",
    "29": "차단된 IP 에서의 호출입니다.",
    "30": "등록되지 않은 인증키입니다. 활용신청 완료 여부와 키를 확인하세요.",
    "31": "인증키 사용 기한이 만료되었습니다.",
}


class KamisError(RuntimeError):
    pass


@dataclass
class PriceRow:
    date: str        # exmn_ymd (YYYYMMDD)
    item_name: str   # item_nm
    variety: str     # vrty_nm
    grade: str       # grd_nm
    market: str      # mrkt_nm
    unit: str        # unit / unit_sz
    price: float     # exmn_dd_prc
    price_per_kg: float | None  # exmn_dd_cnvs_prc


@lru_cache(maxsize=1)
def codes() -> dict:
    with open(DATA_DIR / "kamis_codes.json", encoding="utf-8") as f:
        return json.load(f)


def service_key() -> str:
    # 같은 공공데이터포털 인증키를 운영 API에서도 사용할 수 있게 한다.
    key = (os.getenv("DATA_GO_KR_SERVICE_KEY") or os.getenv("DATA_GO_KR_API_KEY") or "").strip()
    if not key:
        raise KamisError(
            "DATA_GO_KR_SERVICE_KEY 가 설정되지 않았습니다.\n"
            "  1) https://www.data.go.kr/data/15156057/openapi.do 에서 활용신청 (자동승인)\n"
            "  2) 마이페이지에서 일반 인증키(Decoding) 복사\n"
            "  3) export DATA_GO_KR_SERVICE_KEY='...'"
        )
    return key


def _raise_if_gateway_error(payload: dict) -> None:
    """게이트웨이 봉투를 먼저 걷어낸다. 200 으로 오는 경우도 있다."""
    envelope = payload.get("OpenAPI_ServiceResponse")
    if not envelope:
        return
    head = envelope.get("cmmMsgHeader", {})
    code = str(head.get("returnReasonCode", ""))
    raise KamisError(
        f"[게이트웨이 {code}] {head.get('returnAuthMsg') or head.get('errMsg', '')}"
        f" — {GATEWAY_CODES.get(code, '공공데이터포털 에러코드 안내를 확인하세요')}"
    )


def build_query(params: dict) -> str:
    """쿼리 문자열. 인증키만 특별 취급한다.

    공공데이터포털은 인증키를 두 형태로 준다 — Encoding 키(%2B 처럼 이미
    퍼센트 인코딩된 것)와 Decoding 키(원문). Encoding 키를 urlencode 에 그대로
    넘기면 '%' 가 '%25' 로 한 번 더 인코딩돼 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`
    가 난다. 키만 봐서는 어느 쪽인지 알 수 없으므로 '%' 포함 여부로 판정한다.
    """
    rest = {k: v for k, v in params.items() if k != "serviceKey"}
    query = urllib.parse.urlencode(rest, safe="[]:")
    key = str(params.get("serviceKey", ""))
    encoded = key if "%" in key else urllib.parse.quote(key, safe="")
    return f"serviceKey={encoded}&{query}"


def _request(params: dict) -> dict:
    url = f"{BASE_URL}?{build_query(params)}"
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            raw = resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        # 인증 실패는 403 + 게이트웨이 봉투로 온다. 본문을 읽어야 이유를 알 수 있다.
        body = exc.read().decode("utf-8", "replace")
        try:
            _raise_if_gateway_error(json.loads(body))
        except json.JSONDecodeError:
            pass
        raise KamisError(f"HTTP {exc.code}: {body[:300]}") from None
    except Exception as exc:
        raise KamisError(f"요청 실패: {exc}") from None

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        raise KamisError(
            f"응답을 JSON 으로 읽지 못했습니다 (returnType 확인): {raw[:300]}"
        ) from None

    _raise_if_gateway_error(payload)

    header = payload.get("response", {}).get("header", {})
    code = str(header.get("resultCode", ""))
    if code not in ("", "00", "0"):
        raise KamisError(
            f"resultCode={code} {header.get('resultMsg', '')} "
            f"({ERROR_CODES.get(code, '명세에 없는 코드')})"
        )
    return payload


def fetch_prices(
    crop_id: str,
    start: date,
    end: date,
    market_code: str | None = None,
    max_pages: int = 200,
) -> list[PriceRow]:
    """작목의 일별 가격을 기간 전체에 대해 페이지네이션하며 받아온다."""
    crop = get_crop(crop_id)
    mapping = getattr(crop, "kamis", None)
    if not mapping:
        raise KamisError(f"crops.json 의 '{crop_id}' 에 kamis 매핑이 없습니다")

    base = {
        "serviceKey": service_key(),
        "returnType": "JSON",
        "numOfRows": MAX_ROWS,
        "cond[exmn_ymd::GTE]": start.strftime(DATE_FMT),
        "cond[exmn_ymd::LTE]": end.strftime(DATE_FMT),
        "cond[ctgry_cd::EQ]": mapping["ctgry_cd"],
        "cond[item_cd::EQ]": mapping["item_cd"],
    }
    for key, param in (
        ("se_cd", "cond[se_cd::EQ]"),
        ("vrty_cd", "cond[vrty_cd::EQ]"),
        ("grd_cd", "cond[grd_cd::EQ]"),
    ):
        if mapping.get(key):
            base[param] = mapping[key]
    if market_code:
        base["cond[mrkt_cd::EQ]"] = market_code

    rows: list[PriceRow] = []
    for page in range(1, max_pages + 1):
        payload = _request({**base, "pageNo": page})
        body = payload.get("response", {}).get("body", {}) or {}
        items = (body.get("items") or {}).get("item") or []
        if isinstance(items, dict):
            items = [items]
        rows.extend(parse_rows(items))

        total = int(body.get("totalCount") or 0)
        if page * MAX_ROWS >= total or not items:
            break
        log.info("KAMIS %s: %d/%d", crop_id, len(rows), total)

    rows.sort(key=lambda r: r.date)
    return rows


def fetch_recent(crop_id: str, max_pages: int = 20) -> list[PriceRow]:
    """최근일자 도·소매 가격정보(recent/price)를 가져온다."""
    crop = get_crop(crop_id)
    mapping = getattr(crop, "kamis", None)
    if not mapping:
        raise KamisError(f"crops.json 의 '{crop_id}' 에 kamis 매핑이 없습니다")
    base = {
        "serviceKey": service_key(), "returnType": "JSON", "numOfRows": MAX_ROWS,
        "cond[ctgry_cd::EQ]": mapping["ctgry_cd"], "cond[item_cd::EQ]": mapping["item_cd"],
    }
    for key, param in (("se_cd", "cond[se_cd::EQ]"), ("vrty_cd", "cond[vrty_cd::EQ]"), ("grd_cd", "cond[grd_cd::EQ]")):
        if mapping.get(key): base[param] = mapping[key]
    rows: list[PriceRow] = []
    original = globals()["BASE_URL"]
    try:
        globals()["BASE_URL"] = RECENT_URL
        for page in range(1, max_pages + 1):
            payload = _request({**base, "pageNo": page})
            body = payload.get("response", {}).get("body", {}) or {}
            items = (body.get("items") or {}).get("item") or []
            if isinstance(items, dict): items = [items]
            rows.extend(parse_rows(items))
            total = int(body.get("totalCount") or 0)
            if page * MAX_ROWS >= total or not items: break
    finally:
        globals()["BASE_URL"] = original
    rows.sort(key=lambda r: r.date, reverse=True)
    return rows

def fetch_recent_records(crop_id: str) -> list[dict]:
    """최근일자 API 원문 행을 반환한다(전일·전주·전년 필드 포함)."""
    crop = get_crop(crop_id); mapping = getattr(crop, "kamis", None)
    if not mapping: raise KamisError(f"crops.json 의 '{crop_id}' 에 매핑이 없습니다")
    base = {"serviceKey": service_key(), "returnType": "JSON", "pageNo": 1, "numOfRows": MAX_ROWS,
            "cond[se_cd::EQ]": mapping.get("se_cd", "02"), "cond[ctgry_cd::EQ]": mapping["ctgry_cd"], "cond[item_cd::EQ]": mapping["item_cd"]}
    payload = _request(base); body = payload.get("response", {}).get("body", {}) or {}; items = (body.get("items") or {}).get("item") or []
    return [items] if isinstance(items, dict) else items


def parse_rows(items: list[dict]) -> list[PriceRow]:
    """응답 item 배열 → PriceRow. 숫자로 못 읽는 행은 조용히 건너뛴다."""
    out: list[PriceRow] = []
    for it in items:
        raw = str(it.get("exmn_dd_prc", "")).replace(",", "").strip()
        if not raw:
            continue
        try:
            price = float(raw)
        except ValueError:
            continue
        if price <= 0:
            continue
        kg_raw = str(it.get("exmn_dd_cnvs_prc", "")).replace(",", "").strip()
        try:
            per_kg = float(kg_raw) if kg_raw else None
        except ValueError:
            per_kg = None
        out.append(
            PriceRow(
                date=str(it.get("exmn_ymd", "")),
                item_name=str(it.get("item_nm", "")),
                variety=str(it.get("vrty_nm", "")),
                grade=str(it.get("grd_nm", "")),
                market=str(it.get("mrkt_nm", "")),
                unit=f"{it.get('unit_sz', '')}{it.get('unit', '')}".strip(),
                price=price,
                price_per_kg=per_kg,
            )
        )
    return out


def daily_national_average(rows: list[PriceRow], use_kg: bool = True) -> list[tuple[str, float]]:
    """시장별 관측을 날짜별 평균으로 접는다.

    같은 날 여러 도매시장 관측이 섞여 들어오므로, 그대로 로그수익률을 내면
    시장 구성 변화가 변동성으로 잡힌다. 단위가 제각각이라 kg환산가격을 우선 쓴다.
    """
    buckets: dict[str, list[float]] = {}
    for r in rows:
        value = r.price_per_kg if (use_kg and r.price_per_kg) else r.price
        if value and value > 0:
            buckets.setdefault(r.date, []).append(value)
    return sorted((d, sum(v) / len(v)) for d, v in buckets.items())


def default_window(years: int = 10) -> tuple[date, date]:
    today = date.today()
    return today - timedelta(days=365 * years), today
