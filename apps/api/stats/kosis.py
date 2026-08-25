"""KOSIS(국가통계포털) — 농촌진흥청 농산물소득조사 수집.

    GET https://kosis.kr/openapi/Param/statisticsParameterData.do

KAMIS 가격이 못 하는 두 가지를 이쪽이 해준다.

  1. **재배방식 구분** — 농산물소득조사는 딸기(수경)과 딸기(토경)을 별도 작목으로
     조사한다. 가격 통계는 품목 단위라 이 구분이 없다.
  2. **환산 가정 제거** — 애초에 소득 시계열이므로 가격→소득 탄력성 가정이 필요없다.

대신 결정적 한계가 하나 있다. 공표값은 **전국 평균**이라 농가별 특이 충격이 이미
상쇄돼 있다. 여기서 잰 σ 는 개별 농가가 겪는 변동의 **하한**이다. 그래서 추정치에
is_lower_bound 를 달아 내보내고, 화면에서도 그렇게 표시한다.

인증키는 환경변수 KOSIS_API_KEY 로만 받는다.
"""
from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

log = logging.getLogger(__name__)

BASE_URL = "https://kosis.kr/openapi/Param/statisticsParameterData.do"
ORG_ID = "143"  # 농촌진흥청

# 농산물소득조사 통계표. 연도 구간이 갈려 있어 둘을 이어 붙여야 전체 시계열이 된다.
TABLES = {
    "시설채소": [("DT_143002_A003", 2003, 2022), ("DT_143002_E003", 2023, 2100)],
    "노지채소": [("DT_143002_A002", 2003, 2022), ("DT_143002_E002", 2023, 2100)],
    "식량특용": [("DT_143002_A001", 2003, 2022), ("DT_143002_E001", 2023, 2100)],
    "과수":     [("DT_143002_A004", 2003, 2022), ("DT_143002_E004", 2023, 2100)],
    "화훼":     [("DT_143002_A005", 2003, 2022), ("DT_143002_E005", 2023, 2100)],
}

# 소득자료집의 비목명. 표기 흔들림을 흡수하려고 부분일치로 찾는다.
ITEM_ALIASES = {
    "income": ("소득",),
    "gross": ("총수입", "조수입"),
    "cost": ("경영비",),
}

# 실호출로 확인한 사실 두 가지 (2026-08):
#  1. 작목과 비목이 각각 별개의 분류축이라 objL1·objL2 를 **둘 다** 보내야 한다.
#     하나만 보내면 err 20 "필수요청변수값이 누락되었습니다. (objL)".
#  2. **표마다 두 축의 순서가 다르다.** 구표(A003)는 C1=작목/C2=비목, 신표(E003)는
#     반대다. C1_OBJ_NM 을 읽어 판정해야 하며, 축을 고정하면 조용히 뒤집힌다.
ITEM_AXIS_HINT = "비목"


class KosisError(RuntimeError):
    pass


@dataclass
class IncomeRow:
    year: int
    crop_name: str   # 작목축의 값
    item: str        # 비목축의 값 (총수입/경영비/소득 …)
    value: float     # DT
    unit: str        # UNIT_NM
    table: str = ""  # TBL_ID


def api_key() -> str:
    key = os.getenv("KOSIS_API_KEY", "").strip()
    if not key:
        raise KosisError(
            "KOSIS_API_KEY 가 설정되지 않았습니다.\n"
            "  1) https://kosis.kr/openapi/ 에서 회원가입 후 활용신청\n"
            "  2) 발급된 인증키를 export KOSIS_API_KEY='...'"
        )
    return key


def _request(params: dict) -> list[dict]:
    url = f"{BASE_URL}?{urllib.parse.urlencode(params)}"
    try:
        with urllib.request.urlopen(url, timeout=40) as resp:
            raw = resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        raise KosisError(f"HTTP {exc.code}: {exc.read()[:200]!r}") from None
    except Exception as exc:
        raise KosisError(f"요청 실패: {exc}") from None

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        raise KosisError(f"JSON 파싱 실패: {raw[:200]}") from None

    # KOSIS 는 오류도 HTTP 200 으로 준다. dict 면 오류, list 면 정상.
    if isinstance(payload, dict):
        raise KosisError(
            f"[err {payload.get('err')}] {payload.get('errMsg', '알 수 없는 오류')}"
        )
    if not isinstance(payload, list):
        raise KosisError(f"예상치 못한 응답 형식: {type(payload).__name__}")
    return payload


def fetch_table(tbl_id: str, start_year: int, end_year: int) -> list[IncomeRow]:
    rows = _request({
        "method": "getList",
        "apiKey": api_key(),
        "orgId": ORG_ID,
        "tblId": tbl_id,
        "itmId": "ALL",
        "objL1": "ALL",
        "objL2": "ALL",   # 두 축을 모두 요청해야 한다 (없으면 err 20)
        "prdSe": "Y",
        "startPrdDe": str(start_year),
        "endPrdDe": str(end_year),
        "format": "json",
        "jsonVD": "Y",
    })
    return parse_rows(rows)


def split_axes(row: dict) -> tuple[str, str]:
    """(작목명, 비목명). 표마다 축 순서가 달라 메타데이터로 판정한다."""
    if ITEM_AXIS_HINT in str(row.get("C1_OBJ_NM", "")):
        return str(row.get("C2_NM", "")).strip(), str(row.get("C1_NM", "")).strip()
    return str(row.get("C1_NM", "")).strip(), str(row.get("C2_NM", "")).strip()


def parse_rows(rows: list[dict]) -> list[IncomeRow]:
    out: list[IncomeRow] = []
    for r in rows:
        raw = str(r.get("DT", "")).replace(",", "").strip()
        if not raw or raw in ("-", "X", "..."):
            continue
        try:
            value = float(raw)
        except ValueError:
            continue
        try:
            year = int(str(r.get("PRD_DE", ""))[:4])
        except ValueError:
            continue
        crop, item = split_axes(r)
        out.append(
            IncomeRow(
                year=year,
                crop_name=crop,
                item=item,
                value=value,
                unit=str(r.get("UNIT_NM", "")).strip(),
                table=str(r.get("TBL_ID", "")).strip(),
            )
        )
    return out


def _matches(name: str, aliases: tuple[str, ...]) -> bool:
    return any(a in name for a in aliases)


def series_for(
    rows: list[IncomeRow], crop_name: str, field: str = "income"
) -> list[tuple[int, float]]:
    """KOSIS 작목명과 비목으로 연도별 시계열을 뽑는다.

    crop_name 은 KOSIS 표기(예: '시설딸기(수경)')여야 한다. crops.json 의 표기와
    다르므로 매핑은 crops.json 의 `kosis` 필드가 들고 있다.
    """
    aliases = ITEM_ALIASES[field]
    key = _normalize(crop_name)
    picked: dict[int, float] = {}
    for r in rows:
        if _normalize(r.crop_name) != key:
            continue
        if not _matches(r.item, aliases):
            continue
        # '소득' 은 '소득률' 에도 걸린다. 비율 항목을 금액으로 오인하면 안 된다.
        if field == "income" and ("률" in r.item or "율" in r.item):
            continue
        picked[r.year] = r.value
    return sorted(picked.items())


def _normalize(name: str) -> str:
    for ch in "()[] ,_-·":
        name = name.replace(ch, "")
    return name


def available_crops(rows: list[IncomeRow]) -> list[str]:
    """수집된 표에 실제로 들어 있는 작목명 목록 (매핑 확인용)."""
    return sorted({r.crop_name for r in rows if r.crop_name})


def available_items(rows: list[IncomeRow]) -> list[str]:
    return sorted({r.item for r in rows if r.item})


def fetch_group(group: str, start_year: int = 2003, end_year: int = 2100) -> list[IncomeRow]:
    """한 작목군의 통계표들을 이어 붙여 전체 연도 시계열을 만든다."""
    if group not in TABLES:
        raise KosisError(f"알 수 없는 작목군 '{group}'. {sorted(TABLES)} 중 하나여야 합니다")
    rows: list[IncomeRow] = []
    errors: list[KosisError] = []
    for tbl_id, lo, hi in TABLES[group]:
        s, e = max(lo, start_year), min(hi, end_year)
        if s > e:
            continue
        try:
            rows.extend(fetch_table(tbl_id, s, e))
        except KosisError as exc:
            # 연도 구간이 나뉜 표는 한쪽이 비어 있을 수 있다. 나머지로 진행한다.
            log.warning("%s(%d~%d) 수집 실패: %s", tbl_id, s, e, exc)
            errors.append(exc)
    if not rows and errors:
        # 전부 실패했다면 '작목을 못 찾았다'가 아니라 원인을 그대로 올린다.
        raise errors[0]
    return rows
