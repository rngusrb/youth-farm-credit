"""작목 층위 계층 모델 — 짧은 계열을 전체 작목에서 빌려 채운다.

관측이 적은 작목은 σ 추정이 못 미덥다. 수경 딸기·수경 토마토는 재배방식 구분이
2023년부터라 **2개년**뿐이고, 그 자체로는 σ 를 잴 수 없다. 지금까지는 관행 계열의
σ 를 레버리지 비율로 옮기는 임시방편을 썼다.

여기서는 같은 문제를 원리적으로 푼다. 27작목 × 12년 패널이 있으므로, 먼저 **작목
전체의 σ 분포**를 추정하고, 각 작목의 σ 를 그 분포 쪽으로 관측 수에 비례해 당긴다
(경험적 베이즈 부분 풀링). 관측이 많은 작목은 제 값을 지키고, 적은 작목은 전체
평균 쪽으로 끌린다.

농가 개인 이력에 쓴 축소추정(stats/shrinkage)과 **같은 아이디어를 한 층 위에서**
적용한 것이다. 둘을 합치면 3단 계층이 된다.

    전체 작목 분포  →  이 작목의 σ  →  이 농가의 σ

추정은 로그 σ 공간에서 한다. σ 는 양수이고 분포가 오른쪽으로 치우쳐 있어,
로그를 취해야 정규 근사가 성립하고 축소가 σ 를 음수로 밀지 않는다.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np


@dataclass
class CropObservation:
    """한 작목의 σ 원추정치."""

    crop: str
    sigma: float
    n_returns: int   # 로그수익률 개수 = 관측연도 − 1


@dataclass
class Population:
    """작목 전체의 σ 분포 (로그 공간)."""

    mu: float          # 로그 σ 의 중심
    tau: float         # 작목 간 산포
    n_crops: int

    @property
    def typical_sigma(self) -> float:
        return math.exp(self.mu)


@dataclass
class PooledSigma:
    crop: str
    sigma: float            # 축소 후
    sigma_raw: float        # 원추정치
    sigma_population: float # 전체 작목의 대표값
    weight_own: float       # 자기 관측에 실린 가중치 0~1
    n_returns: int

    @property
    def shrunk_by(self) -> float:
        if self.sigma_raw <= 0:
            return 0.0
        return abs(self.sigma - self.sigma_raw) / self.sigma_raw


# 로그 σ 의 표본분산: Var(log s) ≈ 1 / (2·df). 관측이 적을수록 크다.
def _sampling_variance(n_returns: int) -> float:
    df = max(n_returns - 1, 1)
    return 1.0 / (2.0 * df)


def fit_population(observations: list[CropObservation]) -> Population:
    """작목 간 σ 분포를 적률법으로 추정한다.

    관측된 산포에는 '작목이 실제로 다른 몫'과 '표본오차 몫'이 섞여 있다.
    후자를 빼야 tau 가 부풀지 않는다.
    """
    usable = [o for o in observations if o.sigma > 0 and o.n_returns >= 2]
    if len(usable) < 3:
        raise ValueError("작목이 3종 미만이면 전체 분포를 추정할 수 없습니다")

    logs = np.array([math.log(o.sigma) for o in usable])
    within = np.mean([_sampling_variance(o.n_returns) for o in usable])
    between = float(np.var(logs, ddof=1)) - within
    return Population(
        mu=float(np.mean(logs)),
        tau=math.sqrt(max(between, 1e-6)),
        n_crops=len(usable),
    )


def pool(observation: CropObservation, population: Population) -> PooledSigma:
    """한 작목의 σ 를 전체 분포 쪽으로 당긴다."""
    tau2 = population.tau ** 2
    if observation.sigma > 0 and observation.n_returns >= 2:
        s2 = _sampling_variance(observation.n_returns)
        weight = tau2 / (tau2 + s2)          # 자기 관측이 정확할수록 1 에 가깝다
        log_raw = math.log(observation.sigma)
    else:
        # 관측이 없거나 너무 짧으면 전적으로 전체 분포를 따른다.
        weight = 0.0
        log_raw = population.mu

    log_pooled = weight * log_raw + (1 - weight) * population.mu
    return PooledSigma(
        crop=observation.crop,
        sigma=math.exp(log_pooled),
        sigma_raw=observation.sigma if observation.sigma > 0 else float("nan"),
        sigma_population=population.typical_sigma,
        weight_own=weight,
        n_returns=observation.n_returns,
    )


def pool_all(observations: list[CropObservation]) -> tuple[Population, dict[str, PooledSigma]]:
    population = fit_population(observations)
    return population, {o.crop: pool(o, population) for o in observations}


def borrow_for_short_series(
    population: Population,
    anchor: PooledSigma,
    leverage_ratio: float,
) -> float:
    """계열이 너무 짧아 자체 추정이 불가능한 작목(수경 등)의 σ.

    같은 품목의 관행 계열을 기준점으로 삼되, 그 기준점 자체도 이미 전체 분포로
    축소된 값을 쓴다. 비용 구조 차이만 레버리지 비율로 반영한다.
    """
    return anchor.sigma * leverage_ratio
