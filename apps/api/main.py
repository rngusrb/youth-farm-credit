"""청년농 여신 설계 서비스 API.

핵심 원칙: 숫자는 LLM 이 생성하지 않는다. 모든 금액·확률·비율은 engine/ 의
결정론적 코드가 계산하고, LLM 은 (a) 자연어 → 구조화 입력, (b) 계산 결과 →
자연어 설명 두 가지만 담당한다.
"""
from __future__ import annotations

import logging
import os
import asyncio
import csv
from datetime import date, datetime, timedelta, timezone
from urllib.parse import unquote

import httpx
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
except ImportError:
    pass

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from dataclasses import asdict
from functools import lru_cache

from agent import consult
from engine.cashflow import cashflow_for
from engine.diagnose import DiagnoseInput, diagnose
from engine.loan import repayment_schedule
from engine.errors import InsufficientCropData
from engine.benchmark import benchmark
from engine.fundingmap import funding_map
from engine.switch import switch_candidates
from engine.levers import solve_for
from engine.stress import stress_for
from engine.params import (
    crops,
    crops_source,
    get_crop,
    policy,
    get_product,
    products,
    unit_area_pyeong,
)
from stats.kamis import fetch_prices, fetch_recent, fetch_recent_records, daily_national_average, KamisError
from llm import extract as extract_mod
from llm.client import available as llm_available
from llm.narrate import narrate
from rag.answer import ask as regulation_ask
from schemas import (
    CashflowRequest,
    DiagnoseRequest,
    ExplainRequest,
    ExplainResponse,
    ExtractRequest,
    ExtractResponse,
    RegulationRequest,
    RegulationResponse,
    StressRequest,
    ConsultRequest,
    LeversRequest,
    BenchmarkRequest,
    PrescribeRequest,
    FundingMapRequest,
    SwitchRequest,
)

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

DISCLAIMER = (
    "이 결과는 공개 통계와 제도 파라미터로 계산한 참고자료이며, "
    "대출 심사 결과나 신용평가가 아닙니다."
)

app = FastAPI(
    title="청년농 여신 설계 서비스",
    version="1.0.0",
    description="적정 차입 한도 산출 · 상환 리스크 시뮬레이션 · 제도 요건 근거 응답",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in os.getenv("CORS_ORIGINS", "*").split(",") if o],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "llm": llm_available()}


@app.get("/api/v1/crops")
def list_crops() -> dict:
    def category(c):
        name = c.name.split("(")[0].strip()
        row = next((r for r in standard_codes() if r.get("중분류명(품목명)", "").strip() == name), {})
        return {"large_code": row.get("대분류코드", ""), "large_name": row.get("대분류명", ""),
                "middle_code": row.get("중분류코드", ""), "middle_name": row.get("중분류명(품목명)", name)}
    rows = []
    for c in crops().values():
        row = {
            "id": c.id, "name": c.name, "price_category_code": (c.kamis or {}).get("ctgry_cd", ""), "price_item_code": (c.kamis or {}).get("item_cd", ""),
            **category(c), "income_per_10a": c.income_per_10a, "sigma": c.sigma, "sigma_source": c.sigma_source,
            "sigma_common": c.sigma_common, "sigma_ci": c.sigma_ci, "sigma_n": (c.factors or {}).get("n"), "group": (c.kosis or {}).get("group"),
            "driver": (c.factors or {}).get("driver"), "harvest_months": c.harvest_months, "has_market": bool(c.market), "income_year": c.income_year,
        }
        rows.append(row)
    # 같은 공공 가격 품목코드를 쓰는 재배방식은 선택 목록에서 한 품목으로 묶는다.
    grouped = {}
    for row in rows:
        key = (row["price_category_code"], row["price_item_code"])
        if key[0] and key[1]:
            bucket = grouped.setdefault(key, {**row, "id": row["id"], "name": row["middle_name"], "_rows": []})
            bucket["_rows"].append(row)
        else:
            grouped.setdefault((row["id"], ""), row)
    for row in grouped.values():
        variants = row.pop("_rows", [])
        if variants:
            row["income_per_10a"] = round(sum(x["income_per_10a"] for x in variants) / len(variants))
            row["sigma"] = round(sum(x["sigma"] for x in variants) / len(variants), 4)
    return {
        "source": crops_source(),
        "unit_area_pyeong": unit_area_pyeong(),
        "crops": list(grouped.values()),
    }


@app.get("/api/v1/auction/realtime")
async def realtime_auction(
    crop_id: str | None = Query(default=None),
    limit: int = Query(default=5, ge=1, le=20),
    series: bool = Query(default=True),
) -> dict:
    """선택 작목과 같은 품목의 전국 공영도매시장 최근 경매가."""
    key = os.getenv("DATA_GO_KR_API_KEY", "").strip()
    if not key:
        return {"status": "unavailable", "items": [], "message": "시세 API 키가 설정되지 않았어요."}
    crop = None
    if crop_id:
        try:
            crop = get_crop(crop_id)
        except KeyError:
            raise HTTPException(status_code=404, detail=f"없는 작목: {crop_id}") from None

    # 전국 요약은 실시간 경매 원천자료 대신 일별 도·소매 가격 API를 사용한다.
    if crop_id and crop:
        try:
            start_day, end_day = date.today() - timedelta(days=400), date.today()
            daily_rows = await asyncio.wait_for(asyncio.to_thread(fetch_prices, crop_id, start_day, end_day, "110001"), timeout=8)
            market_label = "서울가락"
            if not daily_rows:
                # perDay의 시장코드가 별도 체계인 경우 시장 조건 없이 품목 전국 평균을 사용한다.
                daily_rows = await asyncio.wait_for(asyncio.to_thread(fetch_prices, crop_id, start_day, end_day), timeout=8)
                market_label = "전국 일별 평균(가락시장 우선 조회)"
            daily = daily_national_average(daily_rows, use_kg=False)
            if daily:
                recent = daily[-30:]
                items = [{"market": "서울가락", "item": crop.name, "price": round(price), "unit": "일별 평균", "quantity": None, "auction_at": day} for day, price in daily[-limit:]]
                return {"status": "ok", "source": f"한국농수산식품유통공사 perDay 일별 도·소매 가격정보 · {market_label}", "as_of": datetime.now(timezone.utc).isoformat(), "crop": crop.name, "match_level": "품목코드", "items": [{**x, "market": market_label} for x in list(reversed(items))], "daily_series": [{"date": d, "price": round(p), "count": 1} for d, p in recent], "average_price": round(sum(p for _, p in recent) / len(recent)), "average_label": "최근 30일 평균"}
        except (KamisError, asyncio.TimeoutError):
            pass
    if crop_id:
        try:
            recent = await asyncio.wait_for(market_recent(crop_id, 1), timeout=8)
        except asyncio.TimeoutError:
            recent = {"items": []}
        if recent.get("items"):
            r = recent["items"][0]
            return {"status": "ok", "crop": crop.name, "items": [{"item": crop.name, "market": "서울가락", "auction_at": r.get("auction_at", ""), "price": r.get("price"), "previous_day_price": r.get("previous_day_price"), "seven_day_price": r.get("seven_day_price"), "month_price": r.get("month_price"), "year_price": r.get("year_price"), "grade": "상품(상) 기준", "unit": r.get("unit", "자료 단위 기준"), "unit_qty": ""}]}
        # recent 응답이 비어도 perDay 일별 가격으로 기간 비교를 계산한다.
        try:
            rows = await asyncio.to_thread(fetch_prices, crop_id, date.today() - timedelta(days=500), date.today())
        except KamisError:
            rows = []
        daily = dict(daily_national_average(rows, use_kg=False))
        dates = sorted(daily)
        if dates:
            latest = dates[-1]
            latest_day = datetime.strptime(latest, "%Y%m%d").date()
            def nearest(days):
                target = latest_day - timedelta(days=days)
                candidates = [d for d in dates if datetime.strptime(d, "%Y%m%d").date() <= target]
                return daily[max(candidates)] if candidates else None
            return {"status": "ok", "crop": crop_name, "items": [{"item": crop_name, "market": "전국 평균", "date": latest, "price": round(daily[latest]), "previous_day_price": round(nearest(1)) if nearest(1) else None, "seven_day_price": round(nearest(7)) if nearest(7) else None, "year_price": round(nearest(365)) if nearest(365) else None, "grade": "상품(상) 기준", "unit": "자료 단위 기준", "unit_qty": ""}]}

    # API는 코드·명칭 조건을 모두 지원한다. 작목 매핑에 코드가 없는 경우에도
    # 별칭으로 중분류를 먼저 찾고, 결과가 없으면 대분류로 다시 찾는다.
    aliases = [crop.name] if crop else []
    if crop:
        aliases.extend(crop.aliases)
    aliases = list(dict.fromkeys(aliases))
    endpoint = "https://apis.data.go.kr/B552845/katRealTime2/trades2"
    rows: list[dict] = []
    average_rows: list[dict] = []
    daily_series: list[dict] = []
    matched_by = ""
    latest = datetime.now().date()
    date_params = {"cond[trd_clcln_ymd::EQ]": latest.strftime("%Y-%m-%d")}
    async with httpx.AsyncClient(timeout=8.0) as client:
        if not aliases:
            try:
                response = await client.get(endpoint, params={"serviceKey": unquote(key), "returnType": "json", "pageNo": 1, "numOfRows": limit, **date_params})
                response.raise_for_status()
                raw = response.json().get("response", {}).get("body", {}).get("items", {}).get("item", [])
                if isinstance(raw, dict): raw = [raw]
                average_rows = rows = raw[:limit]
                matched_by = "전국"
            except (httpx.HTTPError, ValueError):
                pass
        for field, level in (("gds_mclsf_nm", "중분류"), ("gds_lclsf_nm", "대분류")):
            if not aliases:
                break
            params = {
                "serviceKey": unquote(key), "returnType": "json",
                "pageNo": 1, "numOfRows": 100,
                f"cond[{field}::LIKE]": aliases[0].replace("(시설,수경)", "").replace("(시설,토경)", ""),
            }
            params.update(date_params)
            try:
                response = await client.get(endpoint, params=params)
                response.raise_for_status()
                payload = response.json()
            except (httpx.HTTPError, ValueError):
                continue
            body = payload.get("response", {}).get("body", {}) if isinstance(payload, dict) else {}
            raw = body.get("items", {}).get("item", []) if isinstance(body, dict) else []
            if isinstance(raw, dict):
                raw = [raw]
            if raw:
                average_rows = raw
                rows, matched_by = sorted(raw, key=lambda r: str(r.get("mdfcn_dt") or r.get("scsbd_dt") or r.get("trd_clcln_ymd") or ""), reverse=True)[:limit], level
                break
        # 명칭 LIKE 조건을 제공하지 않는 운영 버전도 있어 한 번 더 넓게 읽고
        # 품목명으로 걸러낸다. 이 경우에도 전국 자료 안에서 같은 품목만 남긴다.
        if not rows and aliases:
            needles = [a.replace("(시설,수경)", "").replace("(시설,토경)", "") for a in aliases]
            # 정산일은 하루 단위로만 조회된다. 오늘 자료가 없으면 최근 30일을
            # 거슬러 올라가며, 최대 1,000건씩 받아 품목명을 걸러낸다.
            for offset in range(31):
                try:
                    target = (latest - timedelta(days=offset)).strftime("%Y-%m-%d")
                    response = await client.get(endpoint, params={
                        "serviceKey": unquote(key), "returnType": "json",
                        "pageNo": 1, "numOfRows": 1000,
                        "cond[trd_clcln_ymd::EQ]": target,
                    })
                    response.raise_for_status()
                    payload = response.json()
                    body = payload.get("response", {}).get("body", {})
                    raw = body.get("items", {}).get("item", [])
                    if isinstance(raw, dict):
                        raw = [raw]
                    average_rows = [r for r in raw if any(n and n in " ".join(str(r.get(k, "")) for k in ("corp_gds_item_nm", "corp_gds_vrty_nm", "gds_lclsf_nm", "gds_mclsf_nm", "gds_sclsf_nm")) for n in needles)]
                    if average_rows:
                        rows = sorted(average_rows, key=lambda r: str(r.get("scsbd_dt") or r.get("trd_clcln_ymd") or ""), reverse=True)[:limit]
                        matched_by = "품목명"
                        break
                except (httpx.HTTPError, ValueError):
                    continue

        if aliases and series:
            needles = [a.replace("(시설,수경)", "").replace("(시설,토경)", "") for a in aliases]
            async def fetch_day(offset: int) -> dict | None:
                target = (latest - timedelta(days=offset)).strftime("%Y-%m-%d")
                try:
                    matched_day = []
                    for page in range(1, 11):
                        response = await client.get(endpoint, params={"serviceKey": unquote(key), "returnType": "json", "pageNo": page, "numOfRows": 1000, "cond[trd_clcln_ymd::EQ]": target})
                        response.raise_for_status()
                        raw = response.json().get("response", {}).get("body", {}).get("items", {}).get("item", [])
                        if isinstance(raw, dict): raw = [raw]
                        matched_day.extend(r for r in raw if any(n and n in " ".join(str(r.get(k, "")) for k in ("corp_gds_item_nm", "corp_gds_vrty_nm", "gds_mclsf_nm", "gds_sclsf_nm")) for n in needles))
                        if matched_day or len(raw) < 1000: break
                    prices = []
                    for r in matched_day:
                        try:
                            p = float(str(r.get("scsbd_prc", "")).replace(",", ""))
                            if p > 0: prices.append(p)
                        except (TypeError, ValueError): pass
                    return {"date": target, "price": round(sum(prices) / len(prices)), "count": len(prices)} if prices else None
                except (httpx.HTTPError, ValueError): return None
            daily_series = []
            for i in range(30):
                value = await fetch_day(i)
                if value: daily_series.append(value)
                await asyncio.sleep(0.35)
            daily_series.sort(key=lambda x: x["date"])

    def clean(row: dict) -> dict:
        price = row.get("scsbd_prc")
        try:
            price = int(float(str(price).replace(",", "")))
        except (TypeError, ValueError):
            price = None
        return {
            "market": row.get("whsl_mrkt_nm") or row.get("whsl_mrkt_cd") or "도매시장",
            "item": row.get("gds_sclsf_nm") or row.get("gds_mclsf_nm") or row.get("gds_lclsf_nm") or "",
            "price": price,
            "unit": row.get("unit_nm") or row.get("pkg_nm") or "",
            "quantity": row.get("qty") or row.get("unit_qty"),
            "auction_at": row.get("scsbd_dt") or row.get("trd_clcln_ymd") or "",
        }

    prices = []
    for row in average_rows:
        try:
            value = float(str(row.get("scsbd_prc")).replace(",", ""))
            if value > 0:
                prices.append(value)
        except (TypeError, ValueError):
            continue
    return {
        "status": "ok" if rows else "empty", "source": "공공데이터포털 농산물 실시간 경매가",
        "as_of": datetime.now(timezone.utc).isoformat(), "crop": crop.name if crop else None,
        "match_level": matched_by, "items": [clean(r) for r in rows], "daily_series": daily_series,
        "average_price": round(sum(prices) / len(prices)) if prices else None,
        "average_label": "최근 30일 평균" if prices else None,
    }


@app.get("/api/v1/market/compare")
async def market_compare(crop_id: str | None = Query(default=None)) -> dict:
    """공판장 최신 평균가와 전일·전년 가격 비교."""
    key = os.getenv("DATA_GO_KR_API_KEY", "").strip()
    if not key:
        return {"status": "unavailable", "items": []}
    aliases: list[str] = []
    crop_name = None
    if crop_id:
        try:
            crop = get_crop(crop_id)
            crop_name = crop.name
            aliases = [crop.name, *crop.aliases]
        except KeyError:
            raise HTTPException(status_code=404, detail=f"없는 작목: {crop_id}") from None
    # 최근일자 도·소매 가격 API를 우선 사용한다. 같은 API의 날짜별 자료가
    # 내려오면 전일·7일 전·전년 값도 여기서 계산해 화면과 기준을 통일한다.
    if crop_id:
        try:
            recent_rows = await asyncio.to_thread(fetch_recent, crop_id)
            by_day: dict[str, list[float]] = {}
            for row in recent_rows:
                if row.price > 0: by_day.setdefault(row.date, []).append(row.price)
            dates = sorted(by_day)
            if dates:
                latest = dates[-1]
                def avg(day):
                    vals = by_day.get(day, [])
                    return round(sum(vals) / len(vals)) if vals else None
                latest_day = datetime.strptime(latest.replace("-", "")[:8], "%Y%m%d").date()
                def nearest(days):
                    target = latest_day - timedelta(days=days)
                    candidates = [d for d in dates if datetime.strptime(d.replace("-", "")[:8], "%Y%m%d").date() <= target]
                    return avg(max(candidates)) if candidates else None
                return {"status": "ok", "crop": crop_name, "items": [{
                    "item": crop_name, "market": "전국 평균", "date": latest,
                    "price": avg(latest), "previous_day_price": nearest(1),
                    "seven_day_price": nearest(7), "year_price": nearest(365),
                    "grade": "상품(상) 기준", "unit": "자료 단위 기준", "unit_qty": "",
                }]}
        except (KamisError, ValueError, TypeError):
            pass
    endpoint = "https://api.odcloud.kr/api/15134477/v1/uddi:f79ced3e-9e53-424e-8682-e2a294f81c58"
    query_name = next((a.replace("(시설,수경)", "").replace("(시설,토경)", "") for a in aliases), "")
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(endpoint, params={
                "serviceKey": unquote(key), "page": 1, "perPage": 1000,
                # 공판장 API는 품목명 조건을 지원해 전체 9만 건을 내려받지 않아도 된다.
                "cond[품목명::EQ]": query_name,
            })
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError):
        return {"status": "unavailable", "items": []}
    records = payload.get("data", []) if isinstance(payload, dict) else []
    needles = [a.replace("(시설,수경)", "").replace("(시설,토경)", "") for a in aliases]
    matched = [r for r in records if not needles or any(n and n in str(r.get("품목명", "")) for n in needles)]
    def number(row: dict, key_name: str) -> float | None:
        try:
            value = float(str(row.get(key_name, "")).replace(",", ""))
            return round(value) if value > 0 else None
        except (TypeError, ValueError):
            return None
    def seven_days_before(row: dict) -> float | None:
        try:
            target = datetime.strptime(str(row.get("가격날짜")), "%Y-%m-%d").date() - timedelta(days=7)
        except (TypeError, ValueError):
            return None
        candidates = []
        for other in matched:
            try:
                day = datetime.strptime(str(other.get("가격날짜")), "%Y-%m-%d").date()
            except (TypeError, ValueError):
                continue
            if day <= target and other.get("품목명") == row.get("품목명"):
                value = number(other, "평균가격")
                if value is not None:
                    candidates.append((day, value))
        return max(candidates, default=(None, None), key=lambda x: x[0] or datetime.min.date())[1]

    latest_date = max((str(r.get("가격날짜", "")) for r in matched), default="")
    latest_records = [r for r in matched if str(r.get("가격날짜", "")) == latest_date] or matched
    grade_records = [r for r in latest_records if str(r.get("등급", "")).strip() in ("상", "상품")]
    if grade_records:
        latest_records = grade_records
    def average_field(records: list[dict], field: str) -> int | None:
        values = [number(r, field) for r in records]
        values = [v for v in values if v is not None]
        return round(sum(values) / len(values)) if values else None
    seven_date = ""
    try:
        seven_date = (datetime.strptime(latest_date, "%Y-%m-%d").date() - timedelta(days=7)).strftime("%Y-%m-%d")
    except ValueError:
        pass
    seven_records = [r for r in matched if str(r.get("가격날짜", "")) == seven_date]
    items = [{
        "item": crop_name or latest_records[0].get("품목명", ""), "market": "전국 평균", "date": latest_date,
        "price": average_field(latest_records, "평균가격"), "previous_day_price": average_field(latest_records, "전일평균가격"),
        "year_price": average_field(latest_records, "전년가격"), "seven_day_price": average_field(seven_records, "평균가격"), "year_change": None,
        "grade": "상품(상) 기준", "unit": latest_records[0].get("거래단위", "자료 단위 기준"), "unit_qty": latest_records[0].get("거래단위수량", ""),
    }] if latest_records else []
    return {"status": "ok" if items else "empty", "crop": crop_name, "items": items}


_quarterly_cache: dict[str, tuple[float, list[dict]]] = {}
_volume_cache: dict[str, tuple[float, list[dict]]] = {}

@app.get("/api/v1/market/recent")
async def market_recent(crop_id: str = Query(...), limit: int = Query(default=5, ge=1, le=20)) -> dict:
    """CSV 품목코드와 가락시장 기준의 최근 도매가·기간 비교를 제공한다."""
    try:
        crop = get_crop(crop_id)
    except KeyError as exc:
        return {"status": "unavailable", "items": [], "message": str(exc)}
    key = os.getenv("DATA_GO_KR_API_KEY", "").strip()
    name = crop.name.split("(")[0].strip()
    try:
        # 외부 최근일자 API가 지연되더라도 화면 전체가 멈추지 않도록 제한한다.
        records = await asyncio.wait_for(asyncio.to_thread(fetch_recent_records, crop_id), timeout=8)
        records = sorted(records, key=lambda r: str(r.get("exmn_ymd", "")), reverse=True)
        if records:
            def num(v):
                try: return round(float(str(v).replace(",", ""))) if v not in (None, "", "-1") else None
                except (TypeError, ValueError): return None
            r = records[0]
            current = num(r.get("exmn_dd_cnvs_prc"));
            if current is not None:
                item = {"market": "전국 일별 평균", "item": r.get("item_nm") or name, "price": current, "unit": "kg", "quantity": None, "auction_at": r.get("exmn_ymd", ""), "previous_day_price": num(r.get("dd1_bfr_cnvs_prc")), "seven_day_price": num(r.get("ww1_bfr_cnvs_prc")), "month_price": num(r.get("mm1_bfr_cnvs_prc")), "year_price": num(r.get("yy1_bfr_cnvs_prc"))}
                series = []
                # 최근일자 응답에 여러 조사일이 포함된 경우 이를 우선 사용한다.
                by_date = {}
                for record in records:
                    day = str(record.get("exmn_ymd", ""))
                    value = num(record.get("exmn_dd_cnvs_prc"))
                    if day and value is not None:
                        by_date.setdefault(day, []).append(value)
                if by_date:
                    series = [{"date": day, "price": round(sum(values) / len(values)), "count": len(values)} for day, values in sorted(by_date.items())[-5:]]
                try:
                    rows = await asyncio.wait_for(asyncio.to_thread(fetch_prices, crop_id, date.today() - timedelta(days=400), date.today()), timeout=8)
                    fetched = [{"date": d, "price": round(p), "count": 1} for d, p in daily_national_average(rows, use_kg=True)[-5:]]
                    if fetched:
                        series = fetched
                except (KamisError, asyncio.TimeoutError):
                    pass
                daily_items = [{"market": "전국 일별 평균", "item": name, "price": row["price"], "unit": "kg", "quantity": None, "auction_at": row["date"]} for row in reversed(series)]
                items = [item] + [row for row in daily_items if row["auction_at"] != item["auction_at"]]
                return {"status": "ok", "source": "한국농수산식품유통공사 최근일자 도·소매 가격정보", "crop": name, "match_level": "품목코드", "items": items[:5], "daily_series": series, "average_price": current, "average_label": "조사일 평균"}
    except (KamisError, asyncio.TimeoutError):
        pass
    code = next((r for r in standard_codes() if r.get("중분류명(품목명)", "").strip() == name), {})
    large = str(code.get("대분류코드") or "08"); middle = str(code.get("중분류코드") or "04")
    large_values = list(dict.fromkeys([large, large.zfill(2), large.lstrip("0") or "0"]))
    middle_values = list(dict.fromkeys([middle, middle.zfill(2), middle.lstrip("0") or "0", middle[-2:]]))
    date_end = date.today(); date_start = date_end - timedelta(days=400)
    raw: list[dict] = []
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            for lc in large_values:
                for mc in middle_values:
                    response = await client.get("https://apis.data.go.kr/B552845/katOrigin/trades", params={"serviceKey": unquote(key), "returnType": "json", "pageNo": 1, "numOfRows": 1000, "selectable": "trd_clcln_ymd,whsl_mrkt_cd,whsl_mrkt_nm,gds_lclsf_nm,gds_mclsf_nm,scsbd_prc,unit_nm,qty", "cond[whsl_mrkt_cd::EQ]": "110001", "cond[gds_lclsf_cd::EQ]": lc, "cond[gds_mclsf_cd::EQ]": mc, "cond[trd_clcln_ymd::GTE]": date_start.isoformat(), "cond[trd_clcln_ymd::LTE]": date_end.isoformat()})
                    response.raise_for_status(); body = response.json().get("response", {}).get("body", {}); items = (body.get("items") or {}).get("item", [])
                    raw.extend([items] if isinstance(items, dict) else items)
    except (httpx.HTTPError, ValueError):
        raw = []
    # 원천 경매자료가 비어 있는 품목은 일별 도·소매 가격(perDay)을 사용한다.
    if not raw:
        try:
            daily_rows = await asyncio.to_thread(fetch_prices, crop_id, date_start - timedelta(days=400), date_end)
            daily_values = daily_national_average(daily_rows, use_kg=False)
            raw = [{"trd_clcln_ymd": day, "scsbd_prc": value, "whsl_mrkt_nm": "전국 일별 평균", "gds_mclsf_nm": name} for day, value in daily_values]
        except KamisError:
            raw = []
    by_day: dict[str, list[float]] = {}
    for row in raw:
        try:
            value = float(str(row.get("scsbd_prc", "")).replace(",", "")); day = str(row.get("trd_clcln_ymd", "")).replace("-", "")[:8]
            if value > 0 and len(day) == 8: by_day.setdefault(day, []).append(value)
        except (TypeError, ValueError): pass
    dates = sorted(by_day)
    def avg(day): return round(sum(by_day[day]) / len(by_day[day])) if day in by_day else None
    def nearest(days):
        if not dates: return None
        target = datetime.strptime(dates[-1], "%Y%m%d").date() - timedelta(days=days)
        candidates = [d for d in dates if datetime.strptime(d, "%Y%m%d").date() <= target]
        return avg(max(candidates)) if candidates else None
    latest = dates[-1] if dates else ""
    items = [{"market": "서울가락", "item": name, "price": avg(latest), "unit": "자료 단위 기준", "quantity": None, "auction_at": latest, "previous_day_price": nearest(1), "seven_day_price": nearest(7), "year_price": nearest(365)}] if latest else []
    prices = [v for values in by_day.values() for v in values]
    return {"status": "ok" if items else "empty", "source": "한국농수산식품유통공사 최근일자 도·소매 가격정보(recent)",
            "crop": crop.name, "match_level": "품목코드", "items": items,
            "average_price": round(sum(prices) / len(prices)) if prices else None,
            "average_label": "최근 자료 평균" if prices else None}

@lru_cache(maxsize=1)
def standard_codes() -> list[dict[str, str]]:
    path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../docs/product/농림수산식품교육문화정보원_표준품목코드_20251105.csv"))
    if not os.path.exists(path):
        candidates = [p for p in (os.path.join(os.path.dirname(__file__), "../../docs/product"),) for p in os.listdir(p) if p.endswith(".csv")]
        path = os.path.join(os.path.dirname(__file__), "../../docs/product", candidates[0]) if candidates else ""
    try:
        with open(path, encoding="cp949", newline="") as f:
            return list(csv.DictReader(f))
    except (OSError, UnicodeError):
        return []

@app.get("/api/v1/market/categories")
async def market_categories() -> dict:
    """katCode/goods API에서 대분류·중분류 전체를 제공한다."""
    key = os.getenv("DATA_GO_KR_API_KEY", "").strip()
    rows: list[dict] = []
    if key:
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.get("https://apis.data.go.kr/B552845/katCode/goods", params={"serviceKey": unquote(key), "returnType": "JSON", "pageNo": 1, "numOfRows": 10000})
                response.raise_for_status()
                raw = response.json().get("response", {}).get("body", {}).get("items", {}).get("item", [])
                rows = [raw] if isinstance(raw, dict) else raw
        except (httpx.HTTPError, ValueError):
            rows = []
    if not rows:
        rows = standard_codes()
    out = []
    seen = set()
    for r in rows:
        item = {"large_code": str(r.get("gds_lclsf_cd") or r.get("대분류코드") or ""), "large_name": r.get("gds_lclsf_nm") or r.get("대분류명") or "", "middle_code": str(r.get("gds_mclsf_cd") or r.get("중분류코드") or ""), "middle_name": r.get("gds_mclsf_nm") or r.get("중분류명(품목명)") or ""}
        if item["large_code"] and item["middle_code"] and (item["large_code"], item["middle_code"]) not in seen:
            seen.add((item["large_code"], item["middle_code"])); out.append(item)
    return {"status": "csv", "items": out, "large_count": len({item["large_code"] for item in out})}

@app.get("/api/v1/market/volume")
async def market_volume(crop_id: str = Query(...)) -> dict:
    """katOrigin/trades 거래량을 월별 평균으로 묶는다."""
    crop = get_crop(crop_id)
    now = datetime.now().timestamp()
    if crop_id in _volume_cache and now - _volume_cache[crop_id][0] < 900:
        return {"status": "ok", "items": _volume_cache[crop_id][1]}
    key = os.getenv("DATA_GO_KR_API_KEY", "").strip()
    mapping = crop.kamis or {}
    if not key or not mapping.get("ctgry_cd"):
        return {"status": "unavailable", "items": []}
    endpoint = "https://apis.data.go.kr/B552845/katOrigin/trades"
    # 전국 공영도매시장 전체를 조회한다. 한 시장에만 의존하면 시장별
    # 미수집일 때문에 출하량이 통째로 비어 보일 수 있다.
    market_codes = ["110001","110008","210001","210005","210009","220001","230001","230003","240001","240004","250001","250003","310101","310401","310901","311201","320101","320201","320301","330101","330201","340101","350101","350301","350402","360301","370101","370401","371501","380101","380201","380303","380401"]
    window = (crop.market or {}).get("window") or []
    date_start, date_end = "2025-01-01", "2025-12-31"
    # 표준코드 API에서 선택 작목의 대·중·소분류를 찾아 대치한다.
    code_map = {}
    name = crop.name.split("(")[0].strip()
    csv_match = next((r for r in standard_codes() if r.get("중분류명(품목명)", "").strip() == name), None)
    if csv_match:
        code_map = {"gds_lclsf_cd": csv_match.get("대분류코드", "").zfill(2), "gds_mclsf_cd": csv_match.get("중분류코드", "")}
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            code_response = await client.get("https://apis.data.go.kr/B552845/katCode/goods", params={"serviceKey": unquote(key), "returnType": "json", "pageNo": 1, "numOfRows": 1000})
            code_response.raise_for_status()
            code_raw = code_response.json().get("response", {}).get("body", {}).get("items", {}).get("item", [])
            if isinstance(code_raw, dict): code_raw = [code_raw]
            match = next((r for r in code_raw if crop.name.replace("(시설,수경)", "") in str(r.get("gds_mclsf_nm", "")) or crop.name.split("(")[0] in str(r.get("gds_mclsf_nm", ""))), None)
            if match: code_map = match
    except (httpx.HTTPError, ValueError):
        pass
    large = str(code_map.get("gds_lclsf_cd") or "08").lstrip("0") or "0"
    middle = str(code_map.get("gds_mclsf_cd") or mapping.get("item_cd") or "04")
    middle_candidates = list(dict.fromkeys([middle, middle.lstrip("0") or "0", middle[-2:]]))
    large_candidates = list(dict.fromkeys([large, large.zfill(2)]))
    base_params = {"serviceKey": unquote(key), "returnType": "json", "numOfRows": 1000,
                   "selectable": "trd_clcln_ymd,whsl_mrkt_cd,gds_lclsf_cd,gds_mclsf_cd,gds_sclsf_cd,qty,unit_tot_qty",
                   "cond[trd_clcln_ymd::GTE]": date_start, "cond[trd_clcln_ymd::LTE]": date_end}
    queries = [{**base_params, "pageNo": 1, "cond[gds_lclsf_cd::EQ]": lc,
                "cond[gds_mclsf_cd::EQ]": mc, "cond[whsl_mrkt_cd::EQ]": market}
               for market in market_codes for lc in large_candidates for mc in middle_candidates]
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            sem = asyncio.Semaphore(8)
            async def request(params):
                async with sem:
                    try:
                        response = await client.get(endpoint, params=params); response.raise_for_status()
                        body = response.json().get("response", {}).get("body", {})
                        raw = (body.get("items") or {}).get("item", [])
                        return [raw] if isinstance(raw, dict) else raw
                    except (httpx.HTTPError, ValueError): return []
            batches = await asyncio.gather(*(request(q) for q in queries))
        raw = [row for batch in batches for row in batch]
    except (httpx.HTTPError, ValueError):
        return {"status": "unavailable", "items": []}
    groups: dict[tuple[int, int], list[float]] = {}
    for row in raw:
        date_raw = next((row.get(k) for k in ("trd_clcln_ymd", "trd_ymd", "scsbd_dt") if row.get(k)), "")
        digits = str(date_raw).replace("-", "")[:8]
        try: parsed = datetime.strptime(digits, "%Y%m%d")
        except ValueError: continue
        value = row.get("qty") or row.get("unit_tot_qty")
        try: number = float(str(value).replace(",", ""))
        except (TypeError, ValueError): continue
        if number > 0: groups.setdefault((parsed.year, parsed.month), []).append(number)
    items = [{"year": y, "month": m, "quantity": round(sum(v) / len(v))} for (y, m), v in sorted(groups.items())]
    _volume_cache[crop_id] = (now, items)
    return {"status": "ok" if items else "empty", "items": items}


@app.get("/api/v1/market/quarterly")
async def market_quarterly(crop_id: str = Query(...)) -> dict:
    """한국농수산식품유통공사 perDay 일별 도·소매 가격 원자료를 월별 평균으로 묶는다."""
    try:
        crop = get_crop(crop_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"없는 작목: {crop_id}") from None
    now = datetime.now().timestamp()
    cached = _quarterly_cache.get(crop_id)
    if cached and now - cached[0] < 900:
        return {"status": "ok", "crop": crop.name, "items": cached[1]}
    market = crop.market or {}
    window = market.get("window") or []
    try:
        start = date.fromisoformat(window[0])
        end = date.fromisoformat(window[1])
    except (IndexError, TypeError, ValueError):
        end = date.today()
        start = end - timedelta(days=365 * 4)
    try:
        rows = await asyncio.to_thread(fetch_prices, crop_id, start, end)
    except KamisError as exc:
        return {"status": "unavailable", "crop": crop.name, "items": [], "message": str(exc)}
    groups: dict[tuple[int, int], list[float]] = {}
    for day, price in daily_national_average(rows):
        parsed = datetime.strptime(day, "%Y%m%d")
        groups.setdefault((parsed.year, parsed.month), []).append(price)
    years = sorted({year for year, _ in groups})[-3:]
    items = [{"year": year, "month": month, "price": round(sum(values) / len(values)), "days": len(values)} for (year, month), values in groups.items() if year in years]
    items.sort(key=lambda x: (x["year"], x["month"]))
    _quarterly_cache[crop_id] = (now, items)
    return {"status": "ok" if items else "empty", "crop": crop.name, "items": items}

@app.get("/api/v1/market/monthly")
async def market_monthly(crop_id: str = Query(...)) -> dict:
    crop = get_crop(crop_id); mapping = crop.kamis or {}; key = os.getenv("DATA_GO_KR_API_KEY", "").strip()
    if not key or not mapping: return {"status": "unavailable", "items": []}
    today = date.today()
    try:
        three_years_ago = today.replace(year=today.year - 3)
    except ValueError:  # 2월 29일처럼 해당 날짜가 없는 해
        three_years_ago = today.replace(year=today.year - 3, day=28)
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.get("https://apis.data.go.kr/B552845/perYearMonth/price", params={"serviceKey": unquote(key), "returnType": "JSON", "pageNo": 1, "numOfRows": 500, "cond[exmn_ym::LTE]": today.strftime("%Y%m"), "cond[exmn_ym::GTE]": three_years_ago.strftime("%Y%m"), "cond[se_cd::EQ]": "02", "cond[ctgry_cd::EQ]": mapping.get("ctgry_cd"), "cond[item_cd::EQ]": mapping.get("item_cd"), "selectable": "exmn_ym,ctgry_cd,item_cd,pmm_avgprc,pmm_hgprc,pmm_lwprc,pmm_stddvtn,pmm_cfcntvrtn,pmm_cfcntrng"}); r.raise_for_status(); raw = r.json().get("response", {}).get("body", {}).get("items", {}).get("item", [])
            raw = [raw] if isinstance(raw, dict) else raw
    except (httpx.HTTPError, ValueError): return {"status": "unavailable", "items": []}
    def n(v):
        try: return round(float(str(v).replace(",", "")))
        except (TypeError, ValueError): return None
    def ratio(v):
        try:
            value = float(str(v).replace(",", ""))
            # API의 변동계수 원값은 퍼센트로 보존한다(예: 28.650%).
            return round(value, 3)
        except (TypeError, ValueError): return None
    grouped: dict[tuple[int, int], list[dict[str, int | None]]] = {}
    for x in raw:
        ym=str(x.get("exmn_ym", x.get("exmn_ymd", ""))).replace("-", "")
        price = n(x.get("pmm_avgprc"))
        if len(ym) >= 6 and price is not None:
            row = {"price": price, "high": n(x.get("pmm_hgprc")), "low": n(x.get("pmm_lwprc")), "stddev": n(x.get("pmm_stddvtn")), "cv": ratio(x.get("pmm_cfcntvrtn")), "range_cv": ratio(x.get("pmm_cfcntrng"))}
            grouped.setdefault((int(ym[:4]), int(ym[4:6])), []).append(row)
    items=[]
    for (year, month), rows in grouped.items():
        def avg(field):
            values = [float(row[field]) for row in rows if row[field] is not None]
            if not values:
                return None
            value = sum(values) / len(values)
            return round(value, 4) if field in ("cv", "range_cv") else round(value)
        items.append({"year": year, "month": month, "price": avg("price"), "high": max((row["high"] for row in rows if row["high"] is not None), default=None), "low": min((row["low"] for row in rows if row["low"] is not None), default=None), "stddev": avg("stddev"), "cv": avg("cv"), "range_cv": avg("range_cv")})
    items = sorted(items, key=lambda x: (x["year"], x["month"]))[-36:]
    return {"status":"ok" if items else "empty","crop":crop.name,"from":three_years_ago.isoformat(),"to":today.isoformat(),"latest":items[-1] if items else None,"items":items}

@app.get("/api/v1/crops/{crop_id}")
def crop_detail(crop_id: str) -> dict:
    """작목 한 건의 전체 근거. 대시보드의 작목·시세 화면이 쓴다."""
    try:
        c = get_crop(crop_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"없는 작목: {crop_id}") from None
    return {
        "id": c.id,
        "name": c.name,
        "large_code": next((r.get("대분류코드", "") for r in standard_codes() if r.get("중분류명(품목명", "").strip() == c.name.split("(")[0].strip()), ""),
        "aliases": c.aliases,
        "group": (c.kosis or {}).get("group"),
        "income_per_10a": c.income_per_10a,
        "gross_per_10a": c.gross_per_10a,
        "cost_per_10a": c.cost_per_10a,
        "cashflow_year": c.cashflow_year,
        "income_year": c.income_year,
        "leverage": (c.gross_per_10a / c.income_per_10a) if (c.gross_per_10a and c.income_per_10a) else None,
        "harvest_months": c.harvest_months,
        "sigma": c.sigma,
        "sigma_common": c.sigma_common,
        "sigma_ci": c.sigma_ci,
        "sigma_source": c.sigma_source,
        "sigma_method": c.sigma_method,
        "sigma_reference": c.sigma_reference,
        "factors": c.factors,
        "market": c.market,
        "kosis": c.kosis,
        "unit_area_pyeong": unit_area_pyeong(),
        # 가정 성분의 출처를 화면에서 그대로 보여줄 수 있게 같이 낸다.
        "idiosyncratic": policy()["sigma_decomposition"],
    }


@app.get("/api/v1/products")
def list_products() -> dict:
    return {
        "products": [p.__dict__ for p in products().values()],
        "disaster_relief": policy()["disaster_relief"],
        "installment_defer_max_count": policy()["installment_defer_max_count"],
        "relief_source": policy()["source"],
    }


@app.get("/api/v1/eligibility")
def eligibility() -> dict:
    """정책자금 자격 요건 + 근거 조항 **원문**.

    자격을 판정해 주지 않는다. 요건과 조문을 내려주고 농가가 스스로 대보게 한다 —
    자격 판정을 잘못 내리면 받을 수 있는 사람이 포기한다.
    코퍼스에서 조문을 못 찾은 요건은 목록에서 빠진다 (지어내지 않는다).
    """
    from rag.eligibility import requirements

    out = []
    for p in products().values():
        reqs = requirements(p)
        if not reqs:
            continue
        out.append({
            "product_id": p.id,
            "product_name": p.name,
            "document": (p.eligibility or {}).get("doc"),
            "requirements": reqs,
        })
    return {
        "products": out,
        "note": "요건과 조문만 제공합니다. 해당 여부의 최종 판단은 사업 시행기관(시·군·구)에 있습니다.",
    }


@app.post("/api/v1/extract", response_model=ExtractResponse)
def extract(req: ExtractRequest) -> dict:
    return extract_mod.extract(req.text, req.known)


@app.post("/api/v1/diagnose")
def run_diagnose(req: DiagnoseRequest) -> dict:
    try:
        result = diagnose(req.to_diagnose_input())
    except KeyError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    result["disclaimer"] = DISCLAIMER
    return result


@app.get("/api/v1/diagnose/{diagnosis_id}")
def get_diagnose(diagnosis_id: str) -> dict:
    """결과 URL 공유용. 서버 저장 없이 id 에 담긴 입력으로 다시 계산한다."""
    try:
        inp = DiagnoseInput.decode(diagnosis_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    try:
        result = diagnose(inp)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None
    result["disclaimer"] = DISCLAIMER
    return result


@app.post("/api/v1/cashflow")
def cashflow(req: CashflowRequest) -> dict:
    """월별 현금흐름. 연 단위로는 안 보이는 운전자금 부족 시점을 짚는다.

    조립은 engine.cashflow.cashflow_for 가 한다 — 도구(engine/tools.py)와 같은 경로를
    써야 두 벌이 갈라지지 않는다. 여기서는 도메인 예외를 상태코드로 번역만 한다.
    """
    inp = req.to_diagnose_input()
    try:
        return cashflow_for(inp, req.principal, req.year)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None
    except InsufficientCropData as exc:
        raise HTTPException(
            status_code=409,
            detail=f"{exc} python -m stats.calibrate_cashflow --write 로 채우세요.",
        ) from None


@app.post("/api/v1/stress")
def stress(req: StressRequest) -> dict:
    """스트레스 테스트. 특정한 나쁜 일이 실제로 일어나면 버티는지 본다.

    조립은 engine.stress.stress_for 가 한다 (도구와 공용).
    """
    inp = req.to_diagnose_input()
    try:
        return stress_for(inp, req.principal)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None
    except InsufficientCropData as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None


@app.post("/api/v1/explain", response_model=ExplainResponse)
def explain(req: ExplainRequest) -> dict:
    d = req.diagnosis
    if "income" not in d or "limits" not in d:
        raise HTTPException(status_code=422, detail="diagnose 응답 전체를 보내주세요.")
    return narrate(d)


@app.get("/api/v1/corpus")
def corpus() -> dict:
    """자료실이 쓰는 목록. 어떤 원문을 몇 개 조항으로 색인했는지 그대로 낸다."""
    from collections import Counter

    from rag.ingest import load_index

    index = load_index()
    by_doc: dict[str, dict] = {}
    for c in index:
        d = by_doc.setdefault(c["doc_title"], {
            "title": c["doc_title"], "year": c.get("doc_year"),
            "url": c.get("source_url"), "chunks": 0, "chars": 0, "sections": set(),
        })
        d["chunks"] += 1
        d["chars"] += len(c["text"])
        top = (c["section_path"] or "").split("-")[0]
        if top:
            d["sections"].add(top)
    docs = []
    for d in by_doc.values():
        docs.append({**d, "sections": len(d["sections"])})
    docs.sort(key=lambda d: -d["chunks"])
    return {
        "documents": docs,
        # 원문을 마지막으로 대조한 날. 색인이 언제 것인지 자료실이 밝히게 한다.
        "checked_on": policy().get("verified_against_guideline", {}).get("checked_on"),
        "total_chunks": len(index),
        "note": (
            "원문은 저장소에 평문으로 함께 배포됩니다. 네트워크 없이도 색인을 다시 만들 수 "
            "있게 하기 위해서입니다. 요약본이 아니라 조항 원문 그대로입니다."
        ),
    }


@app.get("/api/v1/stats")
def data_stats() -> dict:
    """데이터 현황. 무엇을 어디서 언제 받았는지."""
    from rag.ingest import load_index

    cs = list(crops().values())
    measured = [c for c in cs if c.sigma_source == "MEASURED"]
    sigmas = sorted(c.sigma for c in cs)
    years = sorted({c.cashflow_year for c in cs if c.cashflow_year})
    return {
        "crops": {
            "total": len(cs),
            "sigma_measured": len(measured),
            "sigma_min": sigmas[0] if sigmas else None,
            "sigma_max": sigmas[-1] if sigmas else None,
            "with_market": sum(1 for c in cs if c.market),
            "with_kamis_mapping": sum(1 for c in cs if (c.kamis or {}).get("available")),
            "with_harvest_months": sum(1 for c in cs if c.harvest_months),
            "cashflow_years": years,
            "income_years": sorted({c.income_year for c in cs if c.income_year}),
            "source": crops_source(),
        },
        "corpus": {"chunks": len(load_index())},
        "products": [
            {"id": p.id, "name": p.name, "limit": p.limit, "rate": p.rate,
             "grace_years": p.grace_years, "amort_years": p.amort_years}
            for p in products().values()
        ],
        "simulation": policy()["simulation"],
        "sigma_decomposition": policy()["sigma_decomposition"],
        "verified_against_guideline": policy()["verified_against_guideline"],
    }


@app.post("/api/v1/regulation/ask", response_model=RegulationResponse)
def regulation(req: RegulationRequest) -> dict:
    return regulation_ask(req.question, req.context)


@app.post("/api/v1/levers")
def levers(req: LeversRequest) -> dict:
    """원하는 금액을 감당하려면 무엇이 얼마나 달라져야 하는지 역으로 찾는다.

    LLM 을 쓰지 않는다 — 탐색은 엔진 이분탐색이라 같은 입력에 같은 답이 나온다.
    """
    inp = req.to_diagnose_input()
    movables = tuple(req.movables) if req.movables else ("living_cost", "other_debt_service", "pyeong")
    try:
        levers = solve_for(inp, req.target_principal, movables=movables)
        base = diagnose(inp)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None

    return {
        "target_principal": req.target_principal,
        "base_crisis_prob": levers[0].crisis_prob_before if levers else None,
        "max_crisis_prob": base["limits"]["max_crisis_prob"],
        "risk_based_limit": base["limits"]["risk_based"],
        "levers": [vars(l) for l in levers],
        "note": ("각 값은 계산 엔진이 이분탐색으로 찾은 최소 변화량입니다. "
                 "탐색 범위(searched_from~searched_to)를 함께 표시합니다."),
    }


@app.post("/api/v1/consult")
def consult_endpoint(req: ConsultRequest) -> dict:
    """에이전트 상담 — 질문을 보고 도구를 골라 실행하고 설명한다.

    되묻기는 정상 흐름이므로 4xx 가 아니라 kind="ask" 로 돌려준다.
    """
    return consult(req.question, req.slots).to_dict()


@app.post("/api/v1/benchmark")
def benchmark_endpoint(req: BenchmarkRequest) -> dict:
    """전국 작목 평균 대비 내 농장 위치.

    실적이 없으면 비교를 만들지 않는다 — 추정치끼리 비교하면 언제나 100%가 나온다.
    """
    try:
        return benchmark(req.crop_id, req.pyeong, tuple(req.income_history))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None
    except InsufficientCropData as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None


@app.post("/api/v1/prescribe")
def prescribe(req: PrescribeRequest) -> dict:
    """맞춤 처방 — 진단 + 평균비교 + 레버 + 신청서 초안.

    숫자는 전부 엔진이 만들고, 초안 문장의 수치는 그 값과 대조해 어긋나면 뺀다.
    """
    from llm.advisor import draft
    from rag.answer import citations_for

    inp = req.to_diagnose_input()
    try:
        base = diagnose(inp)
        bench = benchmark(req.crop_id, req.pyeong, tuple(req.income_history))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None
    except InsufficientCropData as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None

    levers = None
    if req.target_principal:
        levers = {
            "target_principal": req.target_principal,
            "levers": [vars(l) for l in solve_for(inp, req.target_principal)],
        }

    # 인용만 필요하다. ask() 를 부르면 아무도 안 읽는 답변 문장을 9초 걸려 만든다.
    cites = citations_for(f"{base['product']['name']} 지원 요건")
    return {
        "diagnosis": base,
        "benchmark": bench,
        "levers": levers,
        "draft": draft(base, levers, bench, cites),
    }


@app.post("/api/v1/funding-map")
def funding_map_endpoint(req: FundingMapRequest) -> dict:
    """25년 자금지도 — 거치 종료·상환 급증·부족 시점을 연도별로."""
    inp = req.to_diagnose_input()
    try:
        principal = req.principal
        if principal is None:
            principal = diagnose(inp)["limits"]["risk_based"]
        if principal <= 0:
            raise HTTPException(
                status_code=409,
                detail="상환여력 기준 권장 차입이 0이라 자금지도를 그릴 수 없습니다. "
                       "면적이나 생활비를 확인해 주세요.",
            )
        return funding_map(inp, principal)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None


@app.post("/api/v1/switch")
def switch_endpoint(req: SwitchRequest) -> dict:
    """작목 전환 후보. **전환 비용 미반영** 을 응답이 명시한다."""
    try:
        return switch_candidates(req.crop_id, req.pyeong, req.top_n)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None
