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

from dataclasses import asdict

from engine.cashflow import monthly_cashflow
from engine.diagnose import DiagnoseInput, diagnose
from engine.loan import repayment_schedule
from engine.stress import run_stress
from engine.params import (
    crops,
    crops_source,
    get_crop,
    policy,
    get_product,
    products,
    unit_area_pyeong,
)
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
                "sigma_common": c.sigma_common,
                "sigma_ci": c.sigma_ci,
                "sigma_n": (c.factors or {}).get("n"),
                "group": (c.kosis or {}).get("group"),
                "driver": (c.factors or {}).get("driver"),
                "harvest_months": c.harvest_months,
                "has_market": bool(c.market),
                "income_year": c.income_year,
            }
            for c in crops().values()
        ],
    }


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


@app.post("/api/v1/cashflow")
def cashflow(req: CashflowRequest) -> dict:
    """월별 현금흐름. 연 단위로는 안 보이는 운전자금 부족 시점을 짚는다."""
    try:
        crop, product = get_crop(req.crop_id), get_product(req.product_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None
    if not crop.gross_per_10a or not crop.cost_per_10a:
        raise HTTPException(
            status_code=409,
            detail=f"{crop.name}은 총수입·경영비가 없어 월별 현금흐름을 낼 수 없습니다. "
                   "python -m stats.calibrate_cashflow --write 로 채우세요.",
        )
    units = req.pyeong / unit_area_pyeong()
    due = repayment_schedule(req.principal, product)
    year_idx = min(req.year, len(due)) - 1
    cf = monthly_cashflow(
        gross=crop.gross_per_10a * units,
        operating_cost=crop.cost_per_10a * units,
        living_cost=req.living_cost,
        debt_payment=float(due[year_idx]) + req.other_debt_service,
        harvest_months=crop.harvest_months,
    )
    return {
        "crop": {"id": crop.id, "name": crop.name, "cashflow_year": crop.cashflow_year,
                 "income_year": crop.income_year,
                 "rescaled": bool(getattr(crop, "cashflow_rescaled", False))},
        "year": year_idx + 1,
        "is_grace_year": year_idx < product.grace_years,
        "annual": {
            "gross": crop.gross_per_10a * units,
            "operating_cost": crop.cost_per_10a * units,
            "income": (crop.gross_per_10a - crop.cost_per_10a) * units,
            "living_cost": req.living_cost,
            "debt_payment": float(due[year_idx]),
            "other_debt_service": req.other_debt_service,
        },
        "harvest_known": cf.harvest_known,
        "harvest_months": list(cf.harvest_months),
        "trough_month": cf.trough_month,
        "trough_balance": cf.trough_balance,
        "working_capital_need": cf.working_capital_need,
        "annual_net": cf.annual_net,
        "months": [asdict(m) for m in cf.months],
        "note": (
            "총수입은 출하월에, 경영비·생활비는 12개월 균등으로 배분합니다. "
            "월별 경영비 배분에 대한 공개 통계가 없어 균등으로 두며, 지어내지 않습니다. "
            "상환은 시행지침 '이자는 연 1회 후취'에 따라 마지막 출하월 다음 달로 봅니다."
        ),
    }


@app.post("/api/v1/stress")
def stress(req: StressRequest) -> dict:
    """스트레스 테스트. 특정한 나쁜 일이 실제로 일어나면 버티는지 본다."""
    try:
        crop, product = get_crop(req.crop_id), get_product(req.product_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None
    if not crop.gross_per_10a or not crop.cost_per_10a:
        raise HTTPException(status_code=409, detail=f"{crop.name}은 총수입·경영비가 없습니다.")

    units = req.pyeong / unit_area_pyeong()
    base = diagnose(DiagnoseInput(
        crop_id=req.crop_id, pyeong=req.pyeong, living_cost=req.living_cost,
        other_debt_service=req.other_debt_service, product_id=req.product_id,
        max_crisis_prob=req.max_crisis_prob,
    ))
    principal = req.principal if req.principal is not None else base["limits"]["risk_based"]
    tolerance = base["limits"]["max_crisis_prob"]

    results = run_stress(
        gross=crop.gross_per_10a * units,
        operating_cost=crop.cost_per_10a * units,
        fixed_outflow=req.living_cost + req.other_debt_service,
        principal=principal,
        product=product,
        sigma=base["sigma"],
        max_crisis_prob=tolerance,
        p_disaster=policy()["simulation"]["p_disaster"],
    )
    return {
        "principal": principal,
        "tolerance": tolerance,
        "sigma": base["sigma"],
        "leverage": (crop.gross_per_10a / (crop.gross_per_10a - crop.cost_per_10a)),
        "scenarios": [asdict(r) for r in results],
        "note": (
            "판정은 crisis_prob 가 아니라 distress_prob 로 합니다. 재해가 잦아지면 "
            "상환연기가 자주 걸려 '부족'으로 세지 않게 되는데, 상환연기는 제도가 "
            "구해준 것이지 농가가 버틴 것이 아니기 때문입니다."
        ),
    }


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
