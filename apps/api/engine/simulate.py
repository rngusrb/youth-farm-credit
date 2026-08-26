"""소득 불확실성 몬테카를로.

예측 모델이 아니다. 결정론적 상환 스케줄 위에 소득 충격과 재해를 얹어
'이 차입 규모에서 상환이 밀릴 확률'을 세는 계산이다.

소득 경로(draw_paths)와 평가(evaluate)를 분리해 둔다. 소득은 차입 규모와
무관하므로, 한 번 뽑은 경로를 여러 원금에 재사용하면 (a) 계산이 수십 배 빨라지고
(b) 공통난수(common random numbers)가 보장돼 '원금이 커지면 위험도 커진다'는
단조성이 표본오차에 흔들리지 않는다. 위험기반 한도 역산이 이 성질에 기댄다.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .loan import repayment_schedule
from .params import LoanProduct, relief_bands, sim_defaults

_D = sim_defaults()


@dataclass
class SimResult:
    dscr_median: float          # 상환기 DSCR 중앙값
    dscr_p10: float             # 하위 10%
    dscr_first_amort: float     # 상환 첫해 DSCR 중앙값 — 원금균등에서 가장 위험한 해
    annual_short_prob: float    # 연간 상환부족 확률
    crisis_prob: float          # 2년 연속 부족 확률
    grace_payment: float        # 거치 중 연 이자
    amort_payment: float        # 상환기 최대 연 상환액 (원금균등은 첫해)
    amort_payment_last: float   # 마지막 해 상환액. 원금균등은 여기까지 줄어든다
    cliff_multiple: float       # amort / grace
    first_risk_year: int | None  # 연간 부족확률 20% 최초 초과 연차
    schedule: list[float] = field(default_factory=list)  # 연도별 상환액 (차트용)
    short_prob_by_year: list[float] = field(default_factory=list)
    # 재해 상환연기가 걸린 상환기 연차의 비율.
    deferral_prob: float = 0.0
    # 2년 연속 '부족 **또는** 상환연기' 확률.
    #
    # crisis_prob 만 보면 재해가 잦을수록 위험이 **줄어드는** 것처럼 보인다.
    # 연기된 해는 부족으로 세지 않기 때문이다(실측: 재해확률 8%→20% 에서
    # crisis 0.755→0.628). 하지만 상환연기는 제도가 구해준 것이지 농가가
    # 버틴 게 아니다. 스트레스 테스트는 이 값으로 판정한다.
    distress_prob: float = 0.0


@dataclass
class IncomePaths:
    """원금과 무관한 부분 — 소득 실현값과 재해 상환연기 마스크."""

    income: np.ndarray    # (n_sim, T)
    deferred: np.ndarray  # (n_sim, T)
    product: LoanProduct
    sigma: float
    n_sim: int
    seed: int


def draw_paths(
    expected_income: float,
    sigma: float,
    product: LoanProduct,
    p_disaster: float = _D["p_disaster"],
    n_sim: int = _D["n_sim"],
    seed: int = _D["seed"],
) -> IncomePaths:
    T = product.term_years
    rng = np.random.default_rng(seed)

    # 1. 소득 충격: 평균보존 로그정규
    shock = np.exp(sigma * rng.normal(size=(n_sim, T)) - 0.5 * sigma ** 2)
    income = expected_income * shock

    # 2. 재해: Bernoulli(p_disaster), 피해율 Uniform(0.30, 0.80)
    hit = rng.random((n_sim, T)) < p_disaster
    damage = rng.uniform(_D["damage_min"], _D["damage_max"], size=(n_sim, T))
    income = np.where(hit, income * (1.0 - damage), income)

    # 3. 상환연기: 피해율 구간별 defer_years 만큼 이후 연차를 마스킹
    deferred = np.zeros((n_sim, T), dtype=bool)
    for band in relief_bands():
        in_band = hit & (damage >= band.damage_min) & (damage < band.damage_max)
        for k in range(band.defer_years):
            if k == 0:
                deferred |= in_band
            else:
                shifted = np.zeros_like(in_band)
                shifted[:, k:] = in_band[:, :-k]
                deferred |= shifted

    return IncomePaths(
        income=income,
        deferred=deferred,
        product=product,
        sigma=sigma,
        n_sim=n_sim,
        seed=seed,
    )


def evaluate(
    paths: IncomePaths,
    principal: float,
    fixed_outflow: float,
    risk_threshold: float = _D["risk_year_threshold"],
) -> SimResult:
    """이미 뽑아둔 소득 경로에 특정 원금의 상환 스케줄을 얹어 집계한다."""
    product = paths.product
    due = repayment_schedule(principal, product)
    n_sim, T = paths.income.shape
    grace = product.grace_years

    # 4. DSCR[t] = (income[t] - fixed_outflow) / due[t]
    net = paths.income - fixed_outflow
    dscr = np.divide(
        net,
        np.tile(due, (n_sim, 1)),
        out=np.full((n_sim, T), 99.0),
        where=due > 0,
    )

    # 5. 부족: DSCR < 1 이고 상환연기 상태가 아닐 때
    short = (dscr < 1.0) & (~paths.deferred)

    # 6. 집계는 상환기(거치 종료 이후)만 대상
    dscr_amort = dscr[:, grace:]
    short_amort = short[:, grace:]
    consecutive = short_amort[:, :-1] & short_amort[:, 1:]

    # 상환연기를 '무사히 넘긴 해' 로 세지 않는 지표. distress_prob 주석 참조.
    deferred_amort = paths.deferred[:, grace:]
    distress = short_amort | deferred_amort

    short_by_year = short.mean(axis=0)
    risk_years = np.flatnonzero(short_by_year > risk_threshold)
    first_risk_year = int(risk_years[0]) + 1 if risk_years.size else None

    g = float(due[0])
    # 원금균등은 상환액이 매년 줄어든다. 대표값은 마지막 해가 아니라
    # 가장 무거운 상환 첫해다 — 절벽의 높이도 이 값으로 재야 한다.
    a = float(due[grace:].max()) if len(due) > grace else 0.0
    return SimResult(
        dscr_median=float(np.median(dscr_amort)),
        dscr_p10=float(np.percentile(dscr_amort, 10)),
        dscr_first_amort=float(np.median(dscr[:, grace])),
        annual_short_prob=float(short_amort.mean()),
        crisis_prob=float(consecutive.any(axis=1).mean()),
        grace_payment=g,
        amort_payment=a,
        amort_payment_last=float(due[-1]),
        cliff_multiple=(a / g) if g else 0.0,
        first_risk_year=first_risk_year,
        schedule=[float(x) for x in due],
        short_prob_by_year=[float(x) for x in short_by_year],
        deferral_prob=float(deferred_amort.mean()),
        distress_prob=float((distress[:, :-1] & distress[:, 1:]).any(axis=1).mean()),
    )


def crisis_prob_at(paths: IncomePaths, principal: float, fixed_outflow: float) -> float:
    """이분탐색용 경량 평가 — 2년 연속 부족 확률만 센다."""
    if principal <= 0:
        return 0.0
    product = paths.product
    g = product.grace_years
    due = repayment_schedule(principal, product)[g:]
    net = paths.income[:, g:] - fixed_outflow
    short = (net < due) & (~paths.deferred[:, g:])
    return float((short[:, :-1] & short[:, 1:]).any(axis=1).mean())


def simulate(
    principal: float,
    expected_income: float,
    fixed_outflow: float,
    sigma: float,
    product: LoanProduct,
    p_disaster: float = _D["p_disaster"],
    n_sim: int = _D["n_sim"],
    seed: int = _D["seed"],
    risk_threshold: float = _D["risk_year_threshold"],
) -> SimResult:
    paths = draw_paths(expected_income, sigma, product, p_disaster, n_sim, seed)
    return evaluate(paths, principal, fixed_outflow, risk_threshold)
