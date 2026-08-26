"""API 요청·응답 스키마."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from engine.diagnose import DEFAULT_PRODUCT_ID


# ── /diagnose ────────────────────────────────────────────────
class DiagnoseRequest(BaseModel):
    crop_id: str
    pyeong: float = Field(gt=0, le=1_000_000)
    living_cost: float = Field(ge=0, le=1_000_000_000)
    other_debt_service: float = Field(default=0.0, ge=0, le=1_000_000_000)
    requested_principal: float | None = Field(default=None, ge=0)
    product_id: str = DEFAULT_PRODUCT_ID
    # 연도순 농업소득 이력(원). 3개년 이상이면 σ 를 개인화한다.
    income_history: list[float] = Field(default_factory=list, max_length=40)
    # 감내할 2년연속 위기확률. 외부 근거가 없는 우리 기준값이라 사용자가 정하게 둔다.
    max_crisis_prob: float | None = Field(default=None, gt=0.005, le=0.5)


# ── /extract ─────────────────────────────────────────────────
class ExtractRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    known: dict[str, Any] = Field(default_factory=dict)


class Slots(BaseModel):
    crop_id: str | None = None
    pyeong: float | None = None
    succession: bool | None = None
    years_farming: int | None = None
    living_cost: float | None = None
    other_debt_service: float | None = None
    requested_principal: float | None = None


class ExtractResponse(BaseModel):
    slots: Slots
    confidence: dict[str, float]
    missing_required: list[str]
    followup_question: str | None
    defaults_applied: list[str] = []
    extractor: Literal["llm", "rule"] = "rule"


# ── /explain ─────────────────────────────────────────────────
class ExplainRequest(BaseModel):
    diagnosis: dict[str, Any]


class ExplainResponse(BaseModel):
    headline: str
    body: str
    actions: list[str]
    numbers_used: list[float]
    dropped_sentences: list[str] = []
    narrator: Literal["llm", "template"] = "template"


# ── /regulation/ask ──────────────────────────────────────────
class RegulationRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    context: dict[str, Any] = Field(default_factory=dict)


class Citation(BaseModel):
    doc: str
    section: str
    text: str
    url: str | None = None
    doc_year: int | None = None
    region: str | None = None


class RegulationResponse(BaseModel):
    answer: str
    citations: list[Citation]
    confidence: Literal["high", "medium", "low", "none"]


# ── /cashflow, /stress ───────────────────────────────
class CashflowRequest(BaseModel):
    crop_id: str
    pyeong: float = Field(gt=0, le=1_000_000)
    living_cost: float = Field(ge=0, le=1_000_000_000)
    other_debt_service: float = Field(default=0.0, ge=0, le=1_000_000_000)
    principal: float = Field(default=0.0, ge=0, le=10_000_000_000)
    product_id: str = DEFAULT_PRODUCT_ID
    # 몇 년차의 상환액으로 볼 것인가. 1=첫해(거치), grace+1=절벽이 오는 해.
    year: int = Field(default=6, ge=1, le=40)


class StressRequest(BaseModel):
    crop_id: str
    pyeong: float = Field(gt=0, le=1_000_000)
    living_cost: float = Field(ge=0, le=1_000_000_000)
    other_debt_service: float = Field(default=0.0, ge=0, le=1_000_000_000)
    principal: float | None = Field(default=None, ge=0, le=10_000_000_000)
    product_id: str = DEFAULT_PRODUCT_ID
    max_crisis_prob: float | None = Field(default=None, gt=0.005, le=0.5)
