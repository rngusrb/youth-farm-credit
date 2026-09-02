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
    # 연도순 농업소득 이력(원). 3개년 이상이면 σ 와 소득 수준을 개인화한다.
    income_history: list[float] = Field(default_factory=list, max_length=40)
    # 그 실적을 낸 면적(평). **pyeong 과 다른 면적을 물을 때 반드시 보낸다** —
    # 안 보내면 실적이 지금 묻는 면적에서 나온 것으로 잡혀, "1,800평으로 늘리면"
    # 이 지금과 똑같은 값을 낸다 (2026-09-02 계획 비교 화면에서 그렇게 나왔다).
    income_history_pyeong: float | None = Field(default=None, gt=0, le=1_000_000)
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


class Action(BaseModel):
    """다음 걸음 하나. 화면이 link 를 실제 경로로 바꾼다."""

    text: str
    detail: str = ""
    link: str | None = None


class ExplainResponse(BaseModel):
    headline: str
    body: str
    actions: list[Action]
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


class ConsultRequest(BaseModel):
    """에이전트 상담. slots 는 이미 아는 값이고, 없으면 되묻는다."""

    question: str = Field(min_length=1, max_length=500)
    slots: dict = Field(default_factory=dict)
    persona: str = Field(default="farmer", pattern="^(farmer|officer)$")


class LeversRequest(BaseModel):
    """원하는 금액을 감당하려면 무엇이 얼마나 달라져야 하는가."""

    crop_id: str
    pyeong: float = Field(gt=0)
    living_cost: float = Field(ge=0)
    other_debt_service: float = Field(default=0.0, ge=0)
    target_principal: float = Field(gt=0)
    movables: list[str] | None = None
    # 실적 이력. 진단과 같은 소득 기준으로 계산해야 화면마다 다른 답이 나오지 않는다.
    # 2026-09-02: 이 화면만 이력을 안 넘겨서 홈과 다른 소득으로 레버를 풀고 있었다.
    actual_income: list[float] = Field(default_factory=list)
    product_id: str = DEFAULT_PRODUCT_ID


class BenchmarkRequest(BaseModel):
    """전국 작목 평균 대비. 실적이 없으면 비교하지 않는다."""

    crop_id: str
    pyeong: float = Field(gt=0)
    actual_income: list[float] = Field(default_factory=list)


class PrescribeRequest(BaseModel):
    """진단·레버·평균비교·조항을 묶어 처방과 신청서 초안을 만든다."""

    crop_id: str
    pyeong: float = Field(gt=0)
    living_cost: float = Field(ge=0)
    other_debt_service: float = Field(default=0.0, ge=0)
    target_principal: float | None = Field(default=None, gt=0)
    actual_income: list[float] = Field(default_factory=list)
    product_id: str = DEFAULT_PRODUCT_ID


class FundingMapRequest(BaseModel):
    """25년 자금지도 — 언제 부담이 커지는가."""

    crop_id: str
    pyeong: float = Field(gt=0)
    living_cost: float = Field(ge=0)
    other_debt_service: float = Field(default=0.0, ge=0)
    principal: float | None = Field(default=None, gt=0)
    product_id: str = DEFAULT_PRODUCT_ID


class SwitchRequest(BaseModel):
    """작목 전환 후보. 전환 비용은 반영하지 않는다."""

    crop_id: str
    pyeong: float = Field(gt=0)
    top_n: int = Field(default=5, ge=1, le=10)
