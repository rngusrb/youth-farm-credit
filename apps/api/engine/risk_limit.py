"""위험기반 한도 · 파라미터 불확실성.

DSCR 1.25 한도(dscr.limit_by_dscr)는 기대소득 하나로 계산하는 결정론적 값이다.
실제로는 소득이 흔들리므로 그 한도에서도 상환이 밀릴 수 있다. 여기서는 같은
질문을 확률로 다시 던진다 — "2년 연속 상환이 밀릴 확률을 목표 이하로 유지하는
최대 원금은 얼마인가".

두 값을 대체 관계가 아니라 나란히 제시한다. DSCR 한도는 은행 심사의 언어이고,
위험기반 한도는 차주가 실제로 겪을 확률의 언어다.
"""
from __future__ import annotations

from dataclasses import dataclass

from .params import LoanProduct, sim_defaults
from .simulate import IncomePaths, crisis_prob_at, draw_paths

_D = sim_defaults()

DEFAULT_MAX_CRISIS_PROB = 0.10

# σ 에는 아직 가정이 섞여 있다(농가 고유 성분). 결과를 점 하나로 내놓는 대신
# 적용 σ 주변에서 어떻게 변하는지 함께 낸다. 작목마다 σ 가 다르므로 고정 격자
# 대신 적용값의 배수로 잡는다 — 고정하면 σ 가 격자 밖으로 나가 버린다.
SIGMA_GRID_MULTIPLIERS = (0.5, 0.75, 1.0, 1.25, 1.5)


def sigma_grid_around(sigma: float) -> tuple[float, ...]:
    """적용 σ 를 반드시 포함하는 격자."""
    return tuple(round(sigma * m, 4) for m in SIGMA_GRID_MULTIPLIERS)


@dataclass
class SigmaPoint:
    sigma: float
    crisis_prob: float
    annual_short_prob: float
    dscr_median: float
    risk_limit: float


@dataclass
class UncertaintyBand:
    """σ 를 모른다는 사실을 결과에 반영한 구간."""

    sigma_grid: list[SigmaPoint]
    crisis_prob_low: float
    crisis_prob_high: float
    risk_limit_low: float
    risk_limit_high: float
    break_even_sigma: float | None  # 목표 위험을 지키는 최대 σ


# 원금이 사실상 0 에 가까울 때도 위기확률이 목표를 넘는다면, 제약은 대출이 아니라
# 생계다. 이 판정에 쓰는 명목 원금.
NOMINAL_PRINCIPAL = 1_000_000.0


def livelihood_floor_prob(paths: IncomePaths, fixed_outflow: float) -> float:
    """차입이 없다시피 해도 남는 위기확률.

    소득이 생활비 아래로 떨어지면 원금이 얼마든 상환은 밀린다. 이 값이 목표를
    넘으면 '얼마를 빌리느냐'가 아니라 '이 규모로 생계가 되느냐'가 문제다.
    """
    return crisis_prob_at(paths, NOMINAL_PRINCIPAL, fixed_outflow)


def limit_by_crisis_prob(
    paths: IncomePaths,
    fixed_outflow: float,
    max_crisis_prob: float = DEFAULT_MAX_CRISIS_PROB,
    tolerance: float = 100_000.0,
) -> float:
    """2년 연속 부족 확률이 목표를 넘지 않는 최대 원금 (이분탐색).

    공통난수를 쓰므로 crisis_prob 는 원금에 대해 단조증가한다. 탐색이 표본오차에
    흔들리지 않는 이유이자, 이 함수가 성립하는 전제다.
    """
    hi = float(paths.product.limit)
    if crisis_prob_at(paths, hi, fixed_outflow) <= max_crisis_prob:
        return hi

    lo = 0.0
    while hi - lo > tolerance:
        mid = (lo + hi) / 2
        if crisis_prob_at(paths, mid, fixed_outflow) <= max_crisis_prob:
            lo = mid
        else:
            hi = mid
    return lo


def sigma_sensitivity(
    expected_income: float,
    fixed_outflow: float,
    principal: float,
    product: LoanProduct,
    sigma_grid: tuple[float, ...],
    max_crisis_prob: float = DEFAULT_MAX_CRISIS_PROB,
    p_disaster: float = _D["p_disaster"],
    n_sim: int = _D["n_sim"],
    seed: int = _D["seed"],
) -> list[SigmaPoint]:
    """σ 를 바꿔가며 같은 계산을 반복한다. σ 외 난수는 seed 고정으로 동일하게 둔다."""
    from .simulate import evaluate

    points: list[SigmaPoint] = []
    for sigma in sigma_grid:
        paths = draw_paths(expected_income, sigma, product, p_disaster, n_sim, seed)
        result = evaluate(paths, principal, fixed_outflow)
        points.append(
            SigmaPoint(
                sigma=sigma,
                crisis_prob=result.crisis_prob,
                annual_short_prob=result.annual_short_prob,
                dscr_median=result.dscr_median,
                risk_limit=limit_by_crisis_prob(paths, fixed_outflow, max_crisis_prob),
            )
        )
    return points


def _interpolate_break_even(points: list[SigmaPoint], target: float) -> float | None:
    """crisis_prob 가 target 을 넘는 지점의 σ 를 선형보간으로 찾는다."""
    for prev, cur in zip(points, points[1:]):
        if prev.crisis_prob <= target < cur.crisis_prob:
            span = cur.crisis_prob - prev.crisis_prob
            if span <= 0:
                return prev.sigma
            w = (target - prev.crisis_prob) / span
            return prev.sigma + w * (cur.sigma - prev.sigma)
    if points and points[0].crisis_prob > target:
        return None  # 가장 낙관적인 σ 에서도 목표를 못 지킨다
    return points[-1].sigma if points else None


def uncertainty_band(
    expected_income: float,
    fixed_outflow: float,
    principal: float,
    product: LoanProduct,
    sigma_grid: tuple[float, ...] | None = None,
    max_crisis_prob: float = DEFAULT_MAX_CRISIS_PROB,
    sigma: float | None = None,
    **kwargs,
) -> UncertaintyBand:
    if sigma_grid is None:
        sigma_grid = sigma_grid_around(sigma if sigma else 0.20)
    points = sigma_sensitivity(
        expected_income,
        fixed_outflow,
        principal,
        product,
        sigma_grid,
        max_crisis_prob,
        **kwargs,
    )
    crisis = [p.crisis_prob for p in points]
    limits = [p.risk_limit for p in points]
    return UncertaintyBand(
        sigma_grid=points,
        crisis_prob_low=min(crisis),
        crisis_prob_high=max(crisis),
        risk_limit_low=min(limits),
        risk_limit_high=max(limits),
        break_even_sigma=_interpolate_break_even(points, max_crisis_prob),
    )
