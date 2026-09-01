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

from agent import consult
from engine.cashflow import cashflow_for
from engine.diagnose import DiagnoseInput, diagnose
from engine.loan import repayment_schedule
from engine.errors import InsufficientCropData
from engine.benchmark import benchmark
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
    """월별 현금흐름. 연 단위로는 안 보이는 운전자금 부족 시점을 짚는다.

    조립은 engine.cashflow.cashflow_for 가 한다 — 도구(engine/tools.py)와 같은 경로를
    써야 두 벌이 갈라지지 않는다. 여기서는 도메인 예외를 상태코드로 번역만 한다.
    """
    inp = DiagnoseInput(
        crop_id=req.crop_id, pyeong=req.pyeong, living_cost=req.living_cost,
        other_debt_service=req.other_debt_service, product_id=req.product_id,
    )
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
    inp = DiagnoseInput(
        crop_id=req.crop_id, pyeong=req.pyeong, living_cost=req.living_cost,
        other_debt_service=req.other_debt_service, product_id=req.product_id,
        max_crisis_prob=req.max_crisis_prob,
    )
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
    inp = DiagnoseInput(
        crop_id=req.crop_id, pyeong=req.pyeong, living_cost=req.living_cost,
        other_debt_service=req.other_debt_service, product_id=req.product_id,
    )
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
    return consult(req.question, req.slots, req.persona).to_dict()


@app.post("/api/v1/benchmark")
def benchmark_endpoint(req: BenchmarkRequest) -> dict:
    """전국 작목 평균 대비 내 농장 위치.

    실적이 없으면 비교를 만들지 않는다 — 추정치끼리 비교하면 언제나 100%가 나온다.
    """
    try:
        return benchmark(req.crop_id, req.pyeong, tuple(req.actual_income))
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
    from rag.answer import ask as regulation_ask

    inp = DiagnoseInput(
        crop_id=req.crop_id, pyeong=req.pyeong, living_cost=req.living_cost,
        other_debt_service=req.other_debt_service, product_id=req.product_id,
        income_history=tuple(req.actual_income),
    )
    try:
        base = diagnose(inp)
        bench = benchmark(req.crop_id, req.pyeong, tuple(req.actual_income))
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

    cites = regulation_ask(f"{base['product']['name']} 지원 요건").get("citations", [])
    return {
        "diagnosis": base,
        "benchmark": bench,
        "levers": levers,
        "draft": draft(base, levers, bench, cites),
    }
