"""σ(소득 변동성) 추정.

crops.json 의 sigma 는 현재 전부 ASSUMED — 근거 없는 0.20 이다. 그런데 결과의
모든 확률 수치가 여기에 매달려 있다(σ 0.10↔0.30 이면 위험기반 한도가 3.1억↔1.1억).
이 모듈은 그 가정값을 실제 시계열로 대체하기 위한 추정기다.

두 가지 입력을 받는다.
  - 연간 소득 시계열 (농가 패널·농진청 원시자료) → 그대로 σ 추정. 가장 정확하다.
  - 일별/월별 가격 시계열 (KAMIS 등)      → 가격 σ 추정 후 소득 σ 로 환산.

**가격 σ 는 소득 σ 가 아니다.** 소득 = 수량 × 가격 − 비용이고, 수량과 가격은 보통
음의 상관을 가진다(풍년이면 값이 떨어진다). 이 상쇄를 무시하고 가격 σ 를 그대로
쓰면 변동성을 과대추정한다. price_to_income_sigma 가 그 보정을 명시적으로 받는다 —
보정 계수 자체가 또 하나의 가정이므로 추정치에 함께 기록해 둔다.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

def _measured_elasticity() -> float:
    """가격-수량 탄력성. KOSIS 요인분해에서 실측한 값을 쓴다.

    예전에는 -0.5 로 찍어 두었으나, 17작목을 실측하니 중앙값이 -0.17 이었다.
    가정이 실제의 3배로 과대했다는 뜻이고, 그만큼 소득 변동을 과소평가하고 있었다.
    """
    try:
        from engine.params import policy

        entry = policy().get("price_quantity_elasticity")
        if entry and entry.get("median") is not None:
            return float(entry["median"])
    except Exception:  # 데이터 파일이 없어도 모듈은 임포트돼야 한다
        pass
    return -0.5


DEFAULT_QUANTITY_ELASTICITY = _measured_elasticity()
# 비용 레버리지 1.0 = 중립. 작목별 실측 레버리지는 stats/leverage.py 가 따로 다룬다.
DEFAULT_COST_LEVERAGE = 1.0

TRADING_DAYS_PER_YEAR = 250
MONTHS_PER_YEAR = 12


@dataclass
class VolatilityEstimate:
    sigma: float
    ci_low: float
    ci_high: float
    n_observations: int
    method: str
    source: str
    assumptions: dict = field(default_factory=dict)

    def as_crop_fields(self) -> dict:
        """crops.json 에 그대로 넣을 수 있는 형태."""
        return {
            "sigma": round(self.sigma, 4),
            "sigma_source": "MEASURED",
            "sigma_ci": [round(self.ci_low, 4), round(self.ci_high, 4)],
            "sigma_method": self.method,
            "sigma_n": self.n_observations,
            "sigma_reference": self.source,
            "sigma_assumptions": self.assumptions,
        }


def log_returns(series: np.ndarray) -> np.ndarray:
    """연속 로그수익률. 0 이하 값은 로그가 정의되지 않으므로 버린다."""
    s = np.asarray(series, dtype=float)
    s = s[np.isfinite(s) & (s > 0)]
    if s.size < 2:
        raise ValueError("유효한 관측치가 2개 미만입니다")
    return np.diff(np.log(s))


def annualize(sigma_per_period: float, periods_per_year: int) -> float:
    """√t 규칙. 기간 수익률이 독립이라는 가정 위에 선다."""
    return sigma_per_period * math.sqrt(periods_per_year)


def deseasonalize(series: np.ndarray, period: int) -> np.ndarray:
    """주기 평균을 빼는 가장 단순한 계절조정.

    수확기·비수확기 가격차를 변동성으로 오인하지 않기 위한 것이다. 관측치가
    한 주기도 안 되면 원본을 그대로 돌려준다.
    """
    s = np.asarray(series, dtype=float)
    if period <= 1 or s.size < period * 2:
        return s
    idx = np.arange(s.size) % period
    seasonal = np.array([s[idx == k].mean() for k in range(period)])
    overall = s.mean()
    if overall == 0:
        return s
    return s / (seasonal[idx] / overall)


def bootstrap_ci(
    returns: np.ndarray,
    periods_per_year: int,
    n_boot: int = 2000,
    alpha: float = 0.05,
    seed: int = 42,
) -> tuple[float, float]:
    """비모수 부트스트랩 신뢰구간.

    σ 를 점 하나로 보고하면 '0.20 이다'라는 착시가 생긴다. 표본이 작을수록
    구간이 넓다는 사실을 그대로 보여주는 게 이 함수의 목적이다.
    """
    rng = np.random.default_rng(seed)
    n = returns.size
    draws = rng.integers(0, n, size=(n_boot, n))
    sigmas = np.std(returns[draws], axis=1, ddof=1) * math.sqrt(periods_per_year)
    lo, hi = np.quantile(sigmas, [alpha / 2, 1 - alpha / 2])
    return float(lo), float(hi)


def estimate_from_annual_series(
    incomes: np.ndarray, source: str, seed: int = 42
) -> VolatilityEstimate:
    """연간 소득 시계열 → σ. 환산 가정이 개입하지 않는 가장 깨끗한 경로."""
    returns = log_returns(incomes)
    sigma = float(np.std(returns, ddof=1))
    lo, hi = bootstrap_ci(returns, periods_per_year=1, seed=seed)
    return VolatilityEstimate(
        sigma=sigma,
        ci_low=lo,
        ci_high=hi,
        n_observations=int(returns.size),
        method="annual_log_return_sd",
        source=source,
        assumptions={},
    )


def price_to_income_sigma(
    price_sigma: float,
    quantity_elasticity: float = DEFAULT_QUANTITY_ELASTICITY,
    cost_leverage: float = DEFAULT_COST_LEVERAGE,
) -> float:
    """가격 σ → 소득 σ.

    매출 = 가격 × 수량, 수량이 가격에 탄력성 e 로 반응하면
    log(매출) 변동은 (1 + e) 배로 줄어든다. 비용 레버리지는 그 위에 곱한다.
    e = -0.5 이면 가격 변동의 절반만 매출로 전달된다.
    """
    return abs(price_sigma * (1.0 + quantity_elasticity) * cost_leverage)


def estimate_from_price_series(
    prices: np.ndarray,
    periods_per_year: int = TRADING_DAYS_PER_YEAR,
    seasonal_period: int | None = None,
    quantity_elasticity: float = DEFAULT_QUANTITY_ELASTICITY,
    cost_leverage: float = DEFAULT_COST_LEVERAGE,
    source: str = "KAMIS 도매가격",
    seed: int = 42,
) -> VolatilityEstimate:
    """가격 시계열 → 소득 σ (환산 가정 포함)."""
    series = np.asarray(prices, dtype=float)
    if seasonal_period:
        series = deseasonalize(series, seasonal_period)

    returns = log_returns(series)
    price_sigma = annualize(float(np.std(returns, ddof=1)), periods_per_year)
    lo, hi = bootstrap_ci(returns, periods_per_year, seed=seed)

    convert = lambda v: price_to_income_sigma(v, quantity_elasticity, cost_leverage)
    return VolatilityEstimate(
        sigma=convert(price_sigma),
        ci_low=convert(lo),
        ci_high=convert(hi),
        n_observations=int(returns.size),
        method="price_log_return_sd_annualized",
        source=source,
        assumptions={
            "quantity_elasticity": quantity_elasticity,
            "cost_leverage": cost_leverage,
            "periods_per_year": periods_per_year,
            "seasonal_period": seasonal_period,
            "note": "가격 변동성을 소득 변동성으로 환산한 값. 연간 소득 실측이 생기면 대체할 것.",
        },
    )
