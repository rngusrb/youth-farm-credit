"""진단 오케스트레이션 — API 계층이 얇아지도록 계산 흐름을 여기서 묶는다."""
from __future__ import annotations

import base64
import re
import hashlib
import json
from dataclasses import asdict, dataclass
from typing import Any

from dataclasses import asdict as _asdict

from estimators.shrinkage import explain, shrink

from .dscr import TARGET_DSCR, capacity, limit_by_dscr, min_area
from .income import annual_income
from .params import get_crop, get_product, policy, sim_defaults
from .risk_limit import (
    DEFAULT_MAX_CRISIS_PROB,
    limit_by_crisis_prob,
    livelihood_floor_prob,
    uncertainty_band,
)
from .simulate import SimResult, draw_paths, evaluate

DEFAULT_PRODUCT_ID = "successor_farmer"


@dataclass(frozen=True)
class DiagnoseInput:
    crop_id: str
    pyeong: float
    living_cost: float
    other_debt_service: float = 0.0
    requested_principal: float | None = None
    product_id: str = DEFAULT_PRODUCT_ID
    # 농가 본인(또는 승계 전 부모)의 연도순 소득 이력. 있으면 σ 를 개인화한다.
    income_history: tuple[float, ...] = ()
    # 감내할 2년연속 위기확률. 링크로 공유해도 같은 기준이 재현돼야 한다.
    max_crisis_prob: float | None = None

    def encode(self) -> str:
        """입력을 그대로 담은 결정론적 id. 서버 저장 없이 결과 URL을 공유한다."""
        payload = {
            "c": self.crop_id,
            "p": round(self.pyeong, 4),
            "l": round(self.living_cost, 2),
            "o": round(self.other_debt_service, 2),
            "r": None if self.requested_principal is None else round(self.requested_principal, 2),
            "pr": self.product_id,
        }
        if self.income_history:
            payload["h"] = [round(v, 2) for v in self.income_history]
        if self.max_crisis_prob is not None:
            payload["m"] = round(self.max_crisis_prob, 4)
        raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
        return "dg_" + base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")

    def short_ref(self) -> str:
        """사람이 읽고 부를 수 있는 문서번호.

        id 자체는 입력을 담은 base64 라 화면에 잘라 붙이면 뜻 모를 문자열이 샌다.
        같은 입력이면 항상 같은 값이 나오는 짧은 해시를 따로 만든다.
        """
        digest = hashlib.sha256(self.encode().encode()).hexdigest().upper()
        return f"{digest[:4]}-{digest[4:8]}"

    @classmethod
    def decode(cls, diagnosis_id: str) -> "DiagnoseInput":
        if not diagnosis_id.startswith("dg_"):
            raise ValueError("malformed diagnosis_id")
        body = diagnosis_id[3:]
        body += "=" * (-len(body) % 4)
        try:
            d = json.loads(base64.urlsafe_b64decode(body.encode()).decode())
        except Exception:
            raise ValueError("malformed diagnosis_id") from None
        return cls(
            crop_id=d["c"],
            pyeong=float(d["p"]),
            living_cost=float(d["l"]),
            other_debt_service=float(d["o"]),
            requested_principal=None if d.get("r") is None else float(d["r"]),
            product_id=d.get("pr", DEFAULT_PRODUCT_ID),
            income_history=tuple(float(v) for v in d.get("h", ())),
            max_crisis_prob=None if d.get("m") is None else float(d["m"]),
        )


# σ 의 신뢰 등급. 값 자체가 아니라 **분산 중 가정이 차지하는 몫**으로 가른다.
# σ = √(σ_공통² + σ_고유²) 에서 σ_고유 는 가정값이므로, 그 제곱이 전체 분산에서
# 차지하는 비중이 곧 "이 숫자의 몇 %가 추측인가"다.
SIGMA_MEASURED_MAX_ASSUMED_SHARE = 0.25
SIGMA_PARTIAL_MAX_ASSUMED_SHARE = 0.75


def _as_of(crop) -> dict:
    """이 진단이 쓴 값들이 **언제 것인지**.

    화면이 `new Date()` 로 오늘을 찍지 않도록 엔진이 내려준다.
    없는 시점은 넣지 않는다 — 모르는 것을 오늘로 채우면 거짓이 된다.
    """
    market = crop.market or {}
    guideline = policy().get("verified_against_guideline", {})
    out = {
        "income_survey_year": crop.income_year,
        "cost_survey_year": crop.cashflow_year,
        "sigma_series": _sigma_years(crop.sigma_reference),
        # 주의: 자료실에 색인된 원문은 2026년판이고, 대출조건(거치·상환·연기)을
        # 쪽·인용까지 대조한 문서는 2025년판이다. 둘을 한 줄로 뭉개면 거짓이 된다.
        "guideline": guideline.get("document"),
        "guideline_year": _doc_year(guideline.get("document")),
        "guideline_checked_on": guideline.get("checked_on"),
        "market_window": market.get("window"),
    }
    return {k: v for k, v in out.items() if v}


def _doc_year(document: str | None) -> int | None:
    """지침 제목 끝의 (2025) 에서 연도만."""
    if not document:
        return None
    m = re.search(r"\((\d{4})\)", document)
    return int(m.group(1)) if m else None


def _sigma_years(reference: str | None) -> str | None:
    """σ 근거 문장에서 계열 구간(2013~2024)만 뽑는다."""
    if not reference:
        return None
    m = re.search(r"(\d{4}\s*~\s*\d{4})", reference)
    return m.group(1).replace(" ", "") if m else None


def sigma_status(sigma_common: float | None, sigma_total: float) -> tuple[str, float]:
    """(등급, 가정이 차지하는 분산 비중).

    실측한 것은 시장 공통분뿐이다. 전체를 MEASURED 로 표시하면 과대 주장이 된다.
    """
    if not sigma_common or sigma_total <= 0:
        return "ASSUMED", 1.0
    assumed_share = max(0.0, 1.0 - (sigma_common ** 2) / (sigma_total ** 2))
    if assumed_share < SIGMA_MEASURED_MAX_ASSUMED_SHARE:
        return "MEASURED", assumed_share
    if assumed_share < SIGMA_PARTIAL_MAX_ASSUMED_SHARE:
        return "PARTIAL", assumed_share
    return "ASSUMED", assumed_share


def resolve_sigma(crop, income_history: tuple[float, ...]) -> tuple[float, dict]:
    """이 진단에 쓸 σ 를 정한다.

    농가 소득 이력이 3개년 이상 있으면 작목 σ 를 사전분포로 두고 개인값으로
    갱신한다(계층적 축소추정). 없으면 작목 σ 를 그대로 쓴다.
    """
    status, assumed_share = sigma_status(crop.sigma_common, crop.sigma)
    base = {
        "source": status,
        "ci": list(crop.sigma_ci) if crop.sigma_ci else None,
        # 구간은 시장 공통분의 표본오차만 담는다. 농가 고유분은 가정값이라
        # 애초에 구간이 없다. 이 사실을 라벨로 달아 보낸다.
        "ci_scope": "market_common_only" if crop.sigma_ci else None,
        "method": crop.sigma_method,
        "reference": crop.sigma_reference,
        "personalized": False,
        "assumed_variance_share": round(assumed_share, 3),
    }
    if len(income_history) < 3:
        return crop.sigma, base


    try:
        result = shrink(income_history, prior_sigma=crop.sigma)
    except ValueError:
        return crop.sigma, base

    return result.sigma, {
        # 농가 자신의 이력에서 나온 값이므로 가정이 섞이지 않는다.
        "source": "PERSONAL",
        "ci": [result.ci_low, result.ci_high],
        "ci_scope": "own_history",
        "method": result.method,
        "reference": result.as_crop_fields()["sigma_reference"],
        "personalized": True,
        "assumed_variance_share": 0.0,
        "note": explain(result),
        "weight_individual": result.weight_individual,
        "sigma_raw": result.sigma_raw,
        "sigma_prior": result.sigma_prior,
    }


def _scenario(result: SimResult) -> dict[str, Any]:
    d = asdict(result)
    d.pop("schedule", None)
    return d


def diagnose(
    inp: DiagnoseInput,
    target: float = TARGET_DSCR,
    max_crisis_prob: float = DEFAULT_MAX_CRISIS_PROB,
    sigma_override: float | None = None,
) -> dict[str, Any]:
    """진단 실행.

    sigma_override 는 작목 σ 를 무시하고 지정한 값으로 계산한다. 명세 §9 골든
    케이스가 'sigma=0.20' 을 공통 파라미터로 못박고 있어서, 데이터가 갱신돼도
    엔진 회귀 테스트가 흔들리지 않도록 열어 둔 통로다. 민감도 분석에도 쓴다.
    """
    crop = get_crop(inp.crop_id)
    product = get_product(inp.product_id)
    cfg = sim_defaults()
    # 입력에 실린 기준이 있으면 그것을 쓴다 (공유 링크 재현성)
    if inp.max_crisis_prob is not None:
        max_crisis_prob = inp.max_crisis_prob

    income = annual_income(inp.crop_id, inp.pyeong)
    fixed_outflow = inp.living_cost + inp.other_debt_service
    cap = capacity(income, inp.living_cost, inp.other_debt_service)

    if sigma_override is not None:
        sigma = sigma_override
        sigma_meta = {"source": "OVERRIDE", "ci": None, "ci_scope": None,
                      "method": "sigma_override", "reference": None,
                      "personalized": False, "assumed_variance_share": 1.0}
    else:
        sigma, sigma_meta = resolve_sigma(crop, inp.income_history)

    available = float(product.limit)
    recommended = limit_by_dscr(cap, product, target)

    base: dict[str, Any] = {
        "diagnosis_id": inp.encode(),
        "document_ref": inp.short_ref(),
        "input": {
            "crop_id": crop.id,
            "crop_name": crop.name,
            "pyeong": inp.pyeong,
            "living_cost": inp.living_cost,
            "other_debt_service": inp.other_debt_service,
            "requested_principal": inp.requested_principal,
            "product_id": product.id,
        },
        "product": {
            "id": product.id,
            "name": product.name,
            "limit": product.limit,
            "rate": product.rate,
            "grace_years": product.grace_years,
            "amort_years": product.amort_years,
            "amort_method": product.amort_method,
            "source": product.source,
        },
        "income": {"annual": income, "capacity": cap},
        "limits": {
            "available": available,
            "recommended": recommended,
            "gap": available - recommended,
        },
        "min_area_pyeong": min_area(
            inp.crop_id, available, inp.living_cost, inp.other_debt_service, product, target
        ),
        "target_dscr": target,
        "sigma": sigma,
        "sigma_source": sigma_meta["source"],
        "sigma_ci": sigma_meta["ci"],
        "sigma_ci_scope": sigma_meta.get("ci_scope"),
        "sigma_assumed_share": sigma_meta.get("assumed_variance_share"),
        "sigma_idiosyncratic": policy()["sigma_decomposition"]["idiosyncratic_sigma"],
        "sigma_method": sigma_meta["method"],
        "sigma_reference": sigma_meta["reference"],
        "sigma_personalized": sigma_meta["personalized"],
        "sigma_note": sigma_meta.get("note"),
        # 실측된 시장 공통 성분. 개인화된 σ 에는 해당 없음(개인 이력이 둘 다 포함).
        "sigma_common": None if sigma_meta["personalized"] else crop.sigma_common,
        # 소득 변동의 원인. 처방이 달라지므로 화면까지 내보낸다.
        "factors": crop.factors,
        # 시장 국면 — 안내용. 한도 계산에는 반영하지 않는다.
        "market": crop.market,
        "assumptions": {
            "p_disaster": cfg["p_disaster"],
            "n_sim": cfg["n_sim"],
            "seed": cfg["seed"],
            "installment_defer_max_count": policy()["installment_defer_max_count"],
            # 지침 원문 대조 결과. 반영한 것과 반영하지 않은 것을 화면에 그대로 낸다.
            "guideline_check": policy().get("verified_against_guideline"),
        },
    }

    if cap <= 0:
        base["status"] = "no_capacity"
        base["scenarios"] = {}
        base["schedule"] = []
        return base

    # 소득 경로는 차입 규모와 무관하므로 한 번만 뽑아 모든 시나리오에 재사용한다.
    paths = draw_paths(income, sigma, product)

    def run(principal: float) -> SimResult:
        return evaluate(paths, principal, fixed_outflow)

    # 위험기반 한도: 2년 연속 상환부족 확률을 목표 이하로 유지하는 최대 원금.
    # DSCR 한도를 대체하지 않고 나란히 제시한다 (§ risk_limit 모듈 주석).
    risk_based = limit_by_crisis_prob(paths, fixed_outflow, max_crisis_prob)

    # 한도가 0 에 붙었다면 원인을 구분해야 한다. 대출이 과한 것인지, 아니면
    # 차입과 무관하게 소득이 생활비를 못 대는 것인지는 처방이 전혀 다르다.
    floor_prob = livelihood_floor_prob(paths, fixed_outflow)
    binding = "livelihood" if floor_prob > max_crisis_prob else "loan"

    scenarios = {
        "at_available": _scenario(at_available := run(available)),
        "at_recommended": _scenario(at_recommended := run(recommended)),
    }
    schedules = {
        "at_available": at_available.schedule,
        "at_recommended": at_recommended.schedule,
    }
    if risk_based > 0:
        at_risk = run(risk_based)
        scenarios["at_risk_based"] = _scenario(at_risk)
        schedules["at_risk_based"] = at_risk.schedule

    req = inp.requested_principal
    if req is not None and abs(req - available) > 1 and req > 0:
        at_requested = run(min(req, available))
        scenarios["at_requested"] = _scenario(at_requested)
        schedules["at_requested"] = at_requested.schedule

    base["limits"]["risk_based"] = risk_based
    # 제도 한도와 **위험기반 한도**의 차이. gap(=available−recommended) 과 다르다.
    # 화면과 해설이 이 값을 각자 빼서 만들면 어느 쪽이 맞는지 알 수 없고,
    # 수치 검증(llm/verify.py)에도 걸린다 — 엔진이 내는 값이어야 한다.
    base["limits"]["unsafe_gap"] = max(0.0, available - risk_based)
    base["limits"]["max_crisis_prob"] = max_crisis_prob
    # DSCR 1.25 는 은행 관행이라는 외부 근거가 있지만, 이 기준은 우리가 정한 값이다.
    # 근거 없는 숫자를 근거 있는 것처럼 두지 않고, 성격을 밝히고 조정 가능하게 한다.
    base["limits"]["max_crisis_prob_basis"] = "service_default"
    base["limits"]["max_crisis_prob_is_default"] = (
        max_crisis_prob == DEFAULT_MAX_CRISIS_PROB
    )
    base["limits"]["binding_constraint"] = binding
    # 각 값이 **언제 것인지**. 화면이 날짜를 지어내지 않도록 여기서 내려준다.
    # 없는 시점은 넣지 않는다 — 모르는 것을 오늘로 찍으면 거짓이 된다.
    base["as_of"] = _as_of(crop)
    base["limits"]["livelihood_floor_prob"] = floor_prob

    # σ 가 가정값인 이상 결과도 점 하나로 내놓으면 안 된다. 그럴듯한 σ 범위
    # 전체에서 위험과 한도가 어떻게 움직이는지 함께 반환한다.
    # 밴드는 '권장'이라고 안내하는 금액에서 평가한다 — 사용자가 실제로 마주할 숫자다.
    band = uncertainty_band(income, fixed_outflow, recommended, product,
                            max_crisis_prob=max_crisis_prob, sigma=sigma)
    base["uncertainty"] = _asdict(band)

    base["status"] = "ok"
    base["scenarios"] = scenarios
    base["schedules"] = schedules
    base["schedule"] = at_available.schedule
    return base
