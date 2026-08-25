"""개인 소득이력 → 개인 σ (계층적 축소추정).

어떤 통계보다 정확한 σ 는 그 농가 자신의 이력이다. 문제는 길이다. 청년농은
3~5년치밖에 없고, 관측 4개로 표본표준편차를 그냥 쓰면 추정치가 엉망이 된다
(자유도 3이면 σ 의 95% 구간이 대략 절반~두 배로 벌어진다).

그래서 작목 σ 를 사전분포로 두고 개인 이력으로 갱신한다. 켤레사전분포
(scaled inverse-χ²) 하에서 사후 평균은 두 분산의 자유도 가중평균이다.

    σ² = (ν₀·σ₀² + (n−1)·s²) / (ν₀ + n−1)

  ν₀ : 사전분포의 자유도. '작목 통계를 관측 몇 개어치로 믿는가'.
  n−1: 개인 이력의 자유도.

관측이 적으면 작목 평균 쪽으로, 쌓일수록 개인 값 쪽으로 자동으로 끌린다.
승계농은 부모 이력을 넣을 수 있어 이 경로가 특히 잘 맞는다.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from .volatility import bootstrap_ci, log_returns

# 작목 통계를 관측 8개어치로 신뢰한다는 뜻. 개인 이력 9년치가 쌓이면
# 개인 쪽 가중치가 절반을 넘는다.
DEFAULT_PRIOR_DF = 8.0
MIN_OBSERVATIONS = 3


@dataclass
class ShrunkSigma:
    sigma: float             # 축소추정된 개인 σ
    sigma_raw: float         # 개인 이력만으로 계산한 값 (참고용)
    sigma_prior: float       # 작목 σ (사전분포)
    weight_individual: float # 개인 이력에 실린 가중치 0~1
    n_observations: int
    ci_low: float
    ci_high: float
    method: str = "hierarchical_shrinkage"

    def as_crop_fields(self) -> dict:
        return {
            "sigma": round(self.sigma, 4),
            "sigma_source": "MEASURED",
            "sigma_ci": [round(self.ci_low, 4), round(self.ci_high, 4)],
            "sigma_method": self.method,
            "sigma_n": self.n_observations,
            "sigma_reference": (
                f"농가 소득이력 {self.n_observations + 1}개년 "
                f"(작목 사전분포 σ={self.sigma_prior:.2f} 에 가중치 "
                f"{1 - self.weight_individual:.0%} 축소)"
            ),
        }


def shrink(
    incomes: list[float] | np.ndarray,
    prior_sigma: float,
    prior_df: float = DEFAULT_PRIOR_DF,
    seed: int = 42,
) -> ShrunkSigma:
    """연간 소득 이력 → 축소추정된 개인 σ.

    incomes 는 연도순 소득 값이다. 최소 3개년(수익률 2개)이 필요하다.
    """
    series = np.asarray(list(incomes), dtype=float)
    if series.size < MIN_OBSERVATIONS:
        raise ValueError(
            f"소득 이력이 {series.size}개년입니다. 최소 {MIN_OBSERVATIONS}개년이 필요합니다."
        )
    if prior_sigma <= 0:
        raise ValueError("prior_sigma 는 양수여야 합니다")

    returns = log_returns(series)
    n = returns.size
    raw_var = float(np.var(returns, ddof=1)) if n >= 2 else 0.0
    df_individual = max(n - 1, 0)

    posterior_var = (
        prior_df * prior_sigma ** 2 + df_individual * raw_var
    ) / (prior_df + df_individual)

    weight = df_individual / (prior_df + df_individual)

    # 구간도 같은 비율로 좁힌다. 개인 이력이 짧으면 구간이 사전분포 쪽으로 붙는다.
    if n >= 2:
        lo_raw, hi_raw = bootstrap_ci(returns, periods_per_year=1, seed=seed)
    else:
        lo_raw = hi_raw = math.sqrt(raw_var)
    sigma = math.sqrt(posterior_var)
    lo = math.sqrt((1 - weight) * prior_sigma ** 2 + weight * lo_raw ** 2)
    hi = math.sqrt((1 - weight) * prior_sigma ** 2 + weight * hi_raw ** 2)

    return ShrunkSigma(
        sigma=sigma,
        sigma_raw=math.sqrt(raw_var),
        sigma_prior=prior_sigma,
        weight_individual=weight,
        n_observations=n,
        ci_low=min(lo, hi),
        ci_high=max(lo, hi),
    )


def explain(result: ShrunkSigma) -> str:
    """화면·해설에 그대로 쓸 수 있는 한 문장."""
    return (
        f"소득 이력 {result.n_observations + 1}개년으로 계산한 변동성은 "
        f"{result.sigma_raw:.2f}, 작목 평균은 {result.sigma_prior:.2f}입니다. "
        f"이력이 짧아 개인 값에 {result.weight_individual:.0%}만 가중해 "
        f"σ={result.sigma:.2f}로 봅니다."
    )
