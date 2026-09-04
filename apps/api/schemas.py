"""API 요청·응답 스키마."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field

from engine.diagnose import DEFAULT_PRODUCT_ID


# ── /diagnose ────────────────────────────────────────────────

class FarmHistory(BaseModel):
    """실적 이력을 받는 요청이 공통으로 쓰는 바탕.

    ## 왜 이 클래스가 있나

    2026-09-02 하루에 **같은 누락을 세 번** 고쳤다 — levers, funding-map, cashflow.
    매번 "엔진은 고쳤는데 HTTP 스키마에 필드가 없어서" 실적이 버려졌다.
    게다가 이름이 두 개였다: 진단은 `income_history`, 나머지는 `actual_income`.
    (오늘 DEV_GUIDE 에 "같은 개념에 두 이름 금지" 를 적어 놓고 스키마가 어기고 있었다.)

    그래서 필드를 여기 한 번만 정의하고 상속시킨다. 새 엔드포인트가 이걸 상속하면
    실적을 자동으로 받는다. **두 이름 다 받되** 내부 이름은 `income_history` 하나다 —
    기존 화면이 보내던 `actual_income` 을 깨지 않으려는 것이고, 새 코드는 쓰지 마라.
    """

    model_config = ConfigDict(populate_by_name=True)

    income_history: list[float] = Field(
        default_factory=list, max_length=40,
        validation_alias=AliasChoices("income_history", "actual_income"))
    #: 그 실적을 낸 면적(평). pyeong 과 다른 면적을 물을 때 반드시 보낸다.
    income_history_pyeong: float | None = Field(default=None, gt=0, le=1_000_000)

    def to_diagnose_input(self):
        """요청 → 엔진 입력. **조립은 여기 한 곳에서만 한다.**

        main.py 가 엔드포인트마다 손으로 조립하다가 `income_history` 를 세 번
        빠뜨렸다(levers·funding-map·cashflow). 한 곳으로 모으면 필드가 늘어도
        빠질 자리가 없다. 모델에 없는 선택 필드는 기본값으로 간다.
        """
        from engine.diagnose import DiagnoseInput

        return DiagnoseInput(
            crop_id=self.crop_id,
            pyeong=self.pyeong,
            living_cost=self.living_cost,
            other_debt_service=getattr(self, "other_debt_service", 0.0),
            requested_principal=getattr(self, "requested_principal", None),
            product_id=getattr(self, "product_id", DEFAULT_PRODUCT_ID),
            # 0·음수는 실적이 아니다. 이 거르기가 진단 엔드포인트에만 있어서,
            # 다른 화면은 빈 칸(0)을 실적 1개년으로 세고 있었다 (2026-09-02).
            income_history=tuple(v for v in self.income_history if v and v > 0),
            income_history_pyeong=self.income_history_pyeong,
            max_crisis_prob=getattr(self, "max_crisis_prob", None),
        )


class DiagnoseRequest(FarmHistory):
    crop_id: str
    pyeong: float = Field(gt=0, le=1_000_000)
    living_cost: float = Field(ge=0, le=1_000_000_000)
    other_debt_service: float = Field(default=0.0, ge=0, le=1_000_000_000)
    requested_principal: float | None = Field(default=None, ge=0)
    product_id: str = DEFAULT_PRODUCT_ID
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
    #: 발췌문과 어긋나 제거된 문장. **조용히 지우면 그게 silent failure 다** —
    #: 상담사·처방 화면은 "N문장을 뺐어요" 를 이미 보여주는데 제도 답변만 말없이
    #: 문장이 사라지고 있었다 (적대적 리뷰 F1, 2026-09-02: 응답 모델에 필드가
    #: 없어서 FastAPI 가 잘라내고 있었다).
    dropped: list[str] = Field(default_factory=list)


# ── /cashflow, /stress ───────────────────────────────
class CashflowRequest(FarmHistory):
    crop_id: str
    pyeong: float = Field(gt=0, le=1_000_000)
    living_cost: float = Field(ge=0, le=1_000_000_000)
    other_debt_service: float = Field(default=0.0, ge=0, le=1_000_000_000)
    principal: float = Field(default=0.0, ge=0, le=10_000_000_000)
    product_id: str = DEFAULT_PRODUCT_ID
    # 몇 년차의 상환액으로 볼 것인가. 1=첫해(거치), grace+1=절벽이 오는 해.
    year: int = Field(default=6, ge=1, le=40)


class StressRequest(FarmHistory):
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


class LeversRequest(FarmHistory):
    """원하는 금액을 감당하려면 무엇이 얼마나 달라져야 하는가."""

    crop_id: str
    pyeong: float = Field(gt=0)
    living_cost: float = Field(ge=0)
    other_debt_service: float = Field(default=0.0, ge=0)
    target_principal: float = Field(gt=0)
    movables: list[str] | None = None
    # 실적 이력. 진단과 같은 소득 기준으로 계산해야 화면마다 다른 답이 나오지 않는다.
    product_id: str = DEFAULT_PRODUCT_ID


class BenchmarkRequest(FarmHistory):
    """전국 작목 평균 대비. 실적이 없으면 비교하지 않는다."""

    crop_id: str
    pyeong: float = Field(gt=0)


class PrescribeRequest(FarmHistory):
    """진단·레버·평균비교·조항을 묶어 처방과 신청서 초안을 만든다."""

    crop_id: str
    pyeong: float = Field(gt=0)
    living_cost: float = Field(ge=0)
    other_debt_service: float = Field(default=0.0, ge=0)
    target_principal: float | None = Field(default=None, gt=0)
    product_id: str = DEFAULT_PRODUCT_ID


class FundingMapRequest(FarmHistory):
    """25년 자금지도 — 언제 부담이 커지는가."""

    crop_id: str
    pyeong: float = Field(gt=0)
    living_cost: float = Field(ge=0)
    other_debt_service: float = Field(default=0.0, ge=0)
    principal: float | None = Field(default=None, gt=0)
    # 실적을 안 받으면 자금지도만 작목 통계 추정치로 그린다. LeversRequest 에는
    product_id: str = DEFAULT_PRODUCT_ID


class SwitchRequest(BaseModel):
    """작목 전환 후보. 전환 비용은 반영하지 않는다."""

    crop_id: str
    pyeong: float = Field(gt=0)
    top_n: int = Field(default=5, ge=1, le=10)
