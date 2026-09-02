"""여신 스트레스 테스트 (core).

몬테카를로는 '평균적으로 얼마나 위험한가'를 센다. 스트레스 테스트는 다른
질문이다 — **특정한 나쁜 일이 실제로 일어나면 버티는가.**

핵심은 영업레버리지다. 총수입이 20% 빠지면 소득은 20%가 아니라 훨씬 크게
빠진다. 경영비는 그대로 나가기 때문이다. 지금까지 crops.json 에 소득만 있어서
이걸 계산할 수 없었는데, 총수입·경영비를 실측으로 채우면서 가능해졌다.

    소득 = 총수입 − 경영비
    가격 −20% ⇒ 소득' = 총수입×0.8 − 경영비
"""
from __future__ import annotations

from dataclasses import dataclass, replace

from .params import LoanProduct
from .simulate import SimResult, draw_paths, evaluate

# 금리 충격 폭. 정책자금은 고정금리(연 1.5%)라 원칙적으로 안 오르지만,
# 지침 Ⅱ-2-1 이 "변동금리 선택 가능" 을 두고 있어 그 경우를 본다.
RATE_SHOCK = 0.0025

PRICE_DROP = 0.20
YIELD_DROP = 0.30
DISASTER_DAMAGE = 0.50   # 지침 p.21 상환연기 상한 구간의 하한
DISASTER_PROB_STRESSED = 0.20  # 평시 0.08 → 재해가 잦은 국면


@dataclass(frozen=True)
class Shock:
    key: str
    label: str
    detail: str
    """무엇을 어떻게 바꾸는지 사람 말로. 화면에 그대로 낸다."""


SHOCKS: tuple[Shock, ...] = (
    Shock("base", "기준", "지금 조건 그대로"),
    Shock("price", "가격 하락", f"농산물 가격 {int(PRICE_DROP * 100)}% 하락 (수확량·경영비 불변)"),
    Shock("yield", "생산량 감소", f"수확량 {int(YIELD_DROP * 100)}% 감소 (경영비는 그대로 나감)"),
    Shock("rate", "금리 상승", f"대출금리 +{int(RATE_SHOCK * 10000)}bp (변동금리 선택 시)"),
    Shock("disaster", "재해 빈발", f"재해 발생확률 {int(DISASTER_PROB_STRESSED * 100)}%로 상승"),
    Shock("combined", "복합 충격", f"가격 {int(PRICE_DROP * 100)}%↓ + 생산량 {int(YIELD_DROP * 100)}%↓ 동시"),
)


@dataclass(frozen=True)
class StressResult:
    key: str
    label: str
    detail: str
    income: float           # 충격 후 연 농업소득
    income_change: float    # 기준 대비 변화율 (음수면 감소)
    capacity: float         # 충격 후 상환여력
    dscr_median: float
    crisis_prob: float
    annual_short_prob: float
    # 상환연기까지 '무사'로 세지 않는 지표. 참고용이며 판정에는 쓰지 않는다.
    distress_prob: float
    deferral_prob: float
    # 이 시나리오가 재해 상환연기에 기대고 있는가.
    # crisis_prob 이 낮아 보여도 이 값이 크면 '제도가 구해준 것'이다.
    relies_on_relief: bool
    first_risk_year: int | None
    survives: bool          # 감내 기준 안에서 버티는가


def shocked_income(
    *, gross: float, operating_cost: float, price_drop: float = 0.0, yield_drop: float = 0.0
) -> float:
    """충격 후 농업소득.

    가격과 수확량은 곱으로 총수입에 들어간다. 경영비는 **줄지 않는다고 본다** —
    실제로는 수확 관련 비용이 일부 줄지만, 그 비율에 대한 공개 근거가 없어서
    지어내지 않고 보수적으로 둔다. 그만큼 이 결과는 비관적이다.
    """
    factor = (1.0 - price_drop) * (1.0 - yield_drop)
    return gross * factor - operating_cost


# 기준 대비 상환연기율이 이 배수를 넘으면 '제도 의존' 으로 표시한다.
RELIEF_DEPENDENCE_RATIO = 1.5


def run_stress(
    *,
    gross: float,
    operating_cost: float,
    fixed_outflow: float,
    principal: float,
    product: LoanProduct,
    sigma: float,
    max_crisis_prob: float,
    p_disaster: float,
) -> list[StressResult]:
    """시나리오별로 다시 시뮬레이션한다.

    fixed_outflow 는 생활비 + 기존 부채상환. principal 은 평가 대상 차입 원금.
    """
    base_income = gross - operating_cost
    out: list[StressResult] = []
    base_deferral: float | None = None

    for s in SHOCKS:
        income = base_income
        prod = product
        pd = p_disaster

        if s.key == "price":
            income = shocked_income(gross=gross, operating_cost=operating_cost, price_drop=PRICE_DROP)
        elif s.key == "yield":
            income = shocked_income(gross=gross, operating_cost=operating_cost, yield_drop=YIELD_DROP)
        elif s.key == "combined":
            income = shocked_income(
                gross=gross, operating_cost=operating_cost,
                price_drop=PRICE_DROP, yield_drop=YIELD_DROP,
            )
        elif s.key == "rate":
            prod = replace(product, rate=product.rate + RATE_SHOCK)
        elif s.key == "disaster":
            pd = DISASTER_PROB_STRESSED

        paths = draw_paths(income, sigma, prod, p_disaster=pd)
        r: SimResult = evaluate(paths, principal, fixed_outflow)
        if base_deferral is None:
            base_deferral = r.deferral_prob
        out.append(
            StressResult(
                key=s.key,
                label=s.label,
                detail=s.detail,
                income=income,
                income_change=(income - base_income) / base_income if base_income else 0.0,
                capacity=income - fixed_outflow,
                dscr_median=r.dscr_median,
                crisis_prob=r.crisis_prob,
                annual_short_prob=r.annual_short_prob,
                distress_prob=r.distress_prob,
                deferral_prob=r.deferral_prob,
                relies_on_relief=r.deferral_prob > (base_deferral or 0.0) * RELIEF_DEPENDENCE_RATIO,
                first_risk_year=r.first_risk_year,
                # 판정은 crisis_prob 으로 한다. 위험기반 한도가 이 정의로 역산되므로
                # 같은 잣대여야 '기준 시나리오는 통과' 라는 당연한 결과가 나온다.
                # distress_prob 으로 재면 상환연기까지 실패로 세어 기준조차 탈락한다.
                survives=r.crisis_prob <= max_crisis_prob,
            )
        )
    return out


# ── 고수준 조립 (엔드포인트와 도구가 공유한다) ─────────────────────────────

def stress_for(inp, principal: float | None = None) -> dict:
    """진단 입력 → 시나리오별 스트레스 결과 (화면·도구 공용).

    principal 을 안 주면 위험기반 권장 한도를 대상으로 잡는다.
    """
    from dataclasses import asdict

    from .diagnose import diagnose
    from .errors import InsufficientCropData
    from .params import get_crop, get_product, policy, unit_area_pyeong

    crop = get_crop(inp.crop_id)
    product = get_product(inp.product_id)
    if not crop.gross_per_10a or not crop.cost_per_10a:
        raise InsufficientCropData(crop.name, "총수입·경영비")

    units = inp.pyeong / unit_area_pyeong()
    base = diagnose(inp)
    target = principal if principal is not None else base["limits"]["risk_based"]
    tolerance = base["limits"]["max_crisis_prob"]

    results = run_stress(
        gross=crop.gross_per_10a * units,
        operating_cost=crop.cost_per_10a * units,
        fixed_outflow=inp.living_cost + inp.other_debt_service,
        principal=target,
        product=product,
        sigma=base["sigma"],
        max_crisis_prob=tolerance,
        p_disaster=policy()["simulation"]["p_disaster"],
    )
    return {
        "principal": target,
        "tolerance": tolerance,
        "sigma": base["sigma"],
        "leverage": crop.gross_per_10a / (crop.gross_per_10a - crop.cost_per_10a),
        "scenarios": [asdict(r) for r in results],
        "note": (
            "판정(survives)은 2년 연속 위기확률(crisis_prob)로 합니다. 위험기반 한도가 "
            "같은 정의로 역산되기 때문에, 다른 잣대를 쓰면 '기준 시나리오조차 탈락' "
            "같은 결과가 나옵니다. 상환연기까지 실패로 세는 distress_prob 은 함께 "
            "돌려주되 판정에는 쓰지 않습니다."
        ),
    }
