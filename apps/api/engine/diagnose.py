"""진단 오케스트레이션 — API 계층이 얇아지도록 계산 흐름을 여기서 묶는다."""
from __future__ import annotations

import base64
import json
from dataclasses import asdict, dataclass
from typing import Any

from dataclasses import asdict as _asdict

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
        raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
        return "dg_" + base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")

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
        )


def resolve_sigma(crop, income_history: tuple[float, ...]) -> tuple[float, dict]:
    """이 진단에 쓸 σ 를 정한다.

    농가 소득 이력이 3개년 이상 있으면 작목 σ 를 사전분포로 두고 개인값으로
    갱신한다(계층적 축소추정). 없으면 작목 σ 를 그대로 쓴다.
    """
    base = {
        "source": crop.sigma_source,
        "ci": list(crop.sigma_ci) if crop.sigma_ci else None,
        "method": crop.sigma_method,
        "reference": crop.sigma_reference,
        "personalized": False,
    }
    if len(income_history) < 3:
        return crop.sigma, base

    from stats.shrinkage import explain, shrink

    try:
        result = shrink(income_history, prior_sigma=crop.sigma)
    except ValueError:
        return crop.sigma, base

    return result.sigma, {
        "source": "MEASURED",
        "ci": [result.ci_low, result.ci_high],
        "method": result.method,
        "reference": result.as_crop_fields()["sigma_reference"],
        "personalized": True,
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

    income = annual_income(inp.crop_id, inp.pyeong)
    fixed_outflow = inp.living_cost + inp.other_debt_service
    cap = capacity(income, inp.living_cost, inp.other_debt_service)

    if sigma_override is not None:
        sigma = sigma_override
        sigma_meta = {"source": "OVERRIDE", "ci": None, "method": "sigma_override",
                      "reference": None, "personalized": False}
    else:
        sigma, sigma_meta = resolve_sigma(crop, inp.income_history)

    available = float(product.limit)
    recommended = limit_by_dscr(cap, product, target)

    base: dict[str, Any] = {
        "diagnosis_id": inp.encode(),
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
    base["limits"]["max_crisis_prob"] = max_crisis_prob
    base["limits"]["binding_constraint"] = binding
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
