"""가격 변동성의 시간 구조 — GARCH(1,1).

지금까지 σ 는 상수였다. "이 작목은 평소 이만큼 흔들린다" 한 값. 그런데 시장이
불안한 시기는 **뭉쳐서** 온다 — 큰 변동 뒤에 큰 변동이 따라오는 현상(변동성 군집)은
금융시장에서 오래 검증됐고, 농산물 도매가격에도 나타난다.

GARCH(1,1) 은 그 구조를 두 개의 계수로 요약한다.

    σ²ₜ = ω + α·(어제 충격)² + β·σ²ₜ₋₁

  α : 어제의 충격이 오늘 변동성에 얼마나 반영되는가 (반응 속도)
  β : 어제의 변동성이 얼마나 이어지는가 (기억)
  α+β : 지속성. 1 에 가까울수록 한번 불안해지면 오래 간다.

여기서 두 가지를 얻는다.

  · **장기 평균 변동성** ω/(1−α−β) — 25년 상환을 논할 때 쓸 값
  · **현재 국면** 지금 조용한 시기인지 불안한 시기인지

25년짜리 대출에는 장기 평균이 본질이다. 현재 국면은 "지금 시작하기 좋은 때인가"를
말해줄 뿐, 한도를 좌우해서는 안 된다. 그래서 σ 를 시변으로 바꾸지 않고,
**장기값은 검증에, 현재값은 안내에** 쓴다.

주의 — 계절작목은 비수확기에 거래가 끊긴다. 딸기는 최대 235일 공백이 있다.
그 구간을 이어 붙여 수익률을 내면 계절 전환이 폭락으로 잡힌다. 공백은 끊는다.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date

import numpy as np
from scipy.optimize import minimize

MAX_GAP_DAYS = 7
MIN_OBSERVATIONS = 250


@dataclass
class GarchFit:
    omega: float
    alpha: float
    beta: float
    n: int
    trading_days_per_year: float
    long_run_daily_sigma: float
    current_daily_sigma: float
    converged: bool

    @property
    def persistence(self) -> float:
        return self.alpha + self.beta

    @property
    def long_run_annual_sigma(self) -> float:
        return self.long_run_daily_sigma * math.sqrt(self.trading_days_per_year)

    @property
    def current_annual_sigma(self) -> float:
        return self.current_daily_sigma * math.sqrt(self.trading_days_per_year)

    @property
    def regime(self) -> str:
        """현재가 평소 대비 어느 국면인가."""
        ratio = self.current_daily_sigma / self.long_run_daily_sigma
        if ratio > 1.25:
            return "turbulent"
        if ratio < 0.8:
            return "calm"
        return "normal"

    @property
    def half_life_days(self) -> float:
        """충격이 절반으로 잦아드는 데 걸리는 날수."""
        p = self.persistence
        return math.inf if p >= 1 else math.log(0.5) / math.log(p)


def _parse(day: str) -> date:
    return date(int(day[:4]), int(day[4:6]), int(day[6:8]))


def segmented_log_returns(
    series: list[tuple[str, float]], max_gap_days: int = MAX_GAP_DAYS
) -> tuple[np.ndarray, float]:
    """연속된 거래일 사이의 로그수익률만 모은다.

    비수확기 공백을 건너뛴 수익률은 계절 전환이지 시장 충격이 아니다.
    함께 연간 거래일 수도 돌려준다 — 계절작목은 이 값이 작아 연율화가 달라진다.
    """
    rows = [(_parse(d), v) for d, v in series if v > 0]
    rows.sort()
    returns: list[float] = []
    for (d0, v0), (d1, v1) in zip(rows, rows[1:]):
        if (d1 - d0).days <= max_gap_days:
            returns.append(math.log(v1 / v0))
    if not rows:
        return np.array([]), 0.0
    span_years = max((rows[-1][0] - rows[0][0]).days / 365.25, 1e-9)
    return np.array(returns), len(rows) / span_years


def _negative_log_likelihood(params: np.ndarray, r2: np.ndarray, var0: float) -> float:
    omega, alpha, beta = params
    if omega <= 0 or alpha < 0 or beta < 0 or alpha + beta >= 0.999:
        return 1e12
    var = var0
    total = 0.0
    for x2 in r2:
        total += math.log(var) + x2 / var
        var = omega + alpha * x2 + beta * var
    return 0.5 * total


def fit_garch(
    series: list[tuple[str, float]], max_gap_days: int = MAX_GAP_DAYS
) -> GarchFit | None:
    """일별 가격 계열에 GARCH(1,1) 을 적합한다."""
    returns, days_per_year = segmented_log_returns(series, max_gap_days)
    if returns.size < MIN_OBSERVATIONS:
        return None

    centered = returns - returns.mean()
    r2 = centered ** 2
    var0 = float(r2.mean())

    best = None
    # 초기값을 몇 개 던져 국소해를 피한다.
    for a0, b0 in ((0.10, 0.85), (0.05, 0.90), (0.20, 0.70)):
        res = minimize(
            _negative_log_likelihood,
            x0=np.array([var0 * (1 - a0 - b0), a0, b0]),
            args=(r2, var0),
            method="Nelder-Mead",
            options={"maxiter": 4000, "xatol": 1e-12, "fatol": 1e-10},
        )
        if best is None or res.fun < best.fun:
            best = res

    omega, alpha, beta = (float(x) for x in best.x)
    if omega <= 0 or alpha < 0 or beta < 0 or alpha + beta >= 0.999:
        return None

    # 마지막 시점의 조건부 분산까지 전진
    var = var0
    for x2 in r2:
        var = omega + alpha * x2 + beta * var

    return GarchFit(
        omega=omega,
        alpha=alpha,
        beta=beta,
        n=int(returns.size),
        trading_days_per_year=days_per_year,
        long_run_daily_sigma=math.sqrt(omega / (1 - alpha - beta)),
        current_daily_sigma=math.sqrt(var),
        converged=bool(best.success),
    )


def ewma_volatility(
    series: list[tuple[str, float]], lam: float = 0.94, max_gap_days: int = MAX_GAP_DAYS
) -> float | None:
    """RiskMetrics EWMA — 적합이 필요 없는 대조군.

    GARCH 추정이 이상한 값을 낼 때 곧바로 알아채기 위한 안전장치다.
    """
    returns, days_per_year = segmented_log_returns(series, max_gap_days)
    if returns.size < MIN_OBSERVATIONS:
        return None
    centered = returns - returns.mean()
    var = float((centered ** 2).mean())
    for x in centered:
        var = lam * var + (1 - lam) * x * x
    return math.sqrt(var * days_per_year)


def annual_average_series(
    series: list[tuple[str, float]], min_days: int = 20
) -> list[tuple[int, float]]:
    """일별 가격 → 연평균 가격.

    농가는 시즌 내내 여러 가격에 판다. 실제로 받는 것은 사실상 연평균이므로,
    소득 변동성과 맞물리는 것은 **연평균의 변동성**이지 일별 변동성이 아니다.
    일별 σ 를 √250 배로 연율화하면 실측 대비 3~10배 과대해진다(검증됨).
    """
    buckets: dict[int, list[float]] = {}
    for day, value in series:
        if value > 0:
            buckets.setdefault(int(day[:4]), []).append(value)
    return sorted(
        (year, sum(v) / len(v))
        for year, v in buckets.items()
        if len(v) >= min_days
    )


def annual_price_sigma(series: list[tuple[str, float]], min_days: int = 20) -> float | None:
    """연평균 가격의 로그수익률 표준편차 — KOSIS 농가수취가격 σ 와 맞대볼 값."""
    annual = annual_average_series(series, min_days)
    if len(annual) < 4:
        return None
    values = np.array([v for _, v in annual], dtype=float)
    return float(np.std(np.diff(np.log(values)), ddof=1))
