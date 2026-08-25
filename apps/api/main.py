"""청년농 여신 설계 서비스 API.

핵심 원칙: 숫자는 LLM 이 생성하지 않는다. 모든 금액·확률·비율은 engine/ 의
결정론적 코드가 계산하고, LLM 은 (a) 자연어 → 구조화 입력, (b) 계산 결과 →
자연어 설명 두 가지만 담당한다.
"""
from __future__ import annotations

import logging
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from engine.diagnose import DiagnoseInput, diagnose
from engine.params import crops, crops_source, policy, products, unit_area_pyeong
from llm import extract as extract_mod
from llm.client import available as llm_available
from llm.narrate import narrate
from rag.answer import ask as regulation_ask
from schemas import (
    DiagnoseRequest,
    ExplainRequest,
    ExplainResponse,
    ExtractRequest,
    ExtractResponse,
    RegulationRequest,
    RegulationResponse,
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
    return {
        "source": crops_source(),
        "unit_area_pyeong": unit_area_pyeong(),
        "crops": [
            {
                "id": c.id,
                "name": c.name,
                "income_per_10a": c.income_per_10a,
                "sigma": c.sigma,
                "sigma_source": c.sigma_source,
            }
            for c in crops().values()
        ],
    }


@app.get("/api/v1/products")
def list_products() -> dict:
    return {
        "products": [p.__dict__ for p in products().values()],
        "disaster_relief": policy()["disaster_relief"],
        "installment_defer_max_count": policy()["installment_defer_max_count"],
        "relief_source": policy()["source"],
    }


@app.post("/api/v1/extract", response_model=ExtractResponse)
def extract(req: ExtractRequest) -> dict:
    return extract_mod.extract(req.text, req.known)


@app.post("/api/v1/diagnose")
def run_diagnose(req: DiagnoseRequest) -> dict:
    payload = req.model_dump()
    payload["income_history"] = tuple(
        v for v in payload.pop("income_history", []) if v and v > 0
    )
    try:
        result = diagnose(DiagnoseInput(**payload))
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


@app.post("/api/v1/explain", response_model=ExplainResponse)
def explain(req: ExplainRequest) -> dict:
    d = req.diagnosis
    if "income" not in d or "limits" not in d:
        raise HTTPException(status_code=422, detail="diagnose 응답 전체를 보내주세요.")
    return narrate(d)


@app.post("/api/v1/regulation/ask", response_model=RegulationResponse)
def regulation(req: RegulationRequest) -> dict:
    return regulation_ask(req.question, req.context)
