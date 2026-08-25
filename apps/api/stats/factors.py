"""소득 변동의 요인분해 — 가격 · 수량 · 비용.

지금까지 σ 하나로 "얼마나 흔들리나"만 말했다. 이 모듈은 "**왜** 흔들리나"를
쪼갠다. 처방이 달라지기 때문에 필요하다.

  · 가격이 원인이면  → 계약재배, 출하 시기 분산
  · 수량이 원인이면  → 시설 보강, 재해보험
  · 비용이 원인이면  → 에너지·자재 계약

농산물소득조사는 작목·연도별로 총수입·경영비·소득뿐 아니라 **농가수취가격과
주산물수량을 따로** 공표한다. 그래서 아래 분해가 가능하다.

    소득 = 총수입 − 경영비
    Δlog소득 ≈ (총수입/소득)·Δlog총수입 − (경영비/소득)·Δlog경영비
    Δlog총수입 ≈ Δlog가격 + Δlog수량 + (부산물·구성 변화)

앞의 계수가 곧 영업레버리지다. 소득이 총수입보다 크게 흔들리는 이유이기도 하다.
각 항의 기여도는 공분산 사영으로 재고, 선형근사 오차는 잔차로 남겨 그대로 보고한다
(실측에서 합계가 94~107% 로 닫힌다).

부수적으로 **가격 대비 수량 탄력성**이 실측된다. KAMIS 가격 σ 를 소득 σ 로 환산할
때 쓰던 가정값(−0.5)을 작목별 실측값으로 대체하는 데 쓴다.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .kosis import IncomeRow, series_for

MIN_YEARS = 9

# 분해에 필요한 비목. 하나라도 없으면 그 작목은 건너뛴다.
REQUIRED = {
    "income": "소득",
    "revenue": "총수입",
    "cost": "경영비",
    "price": "농가수취가격",
    "quantity": "주산물수량",
}


@dataclass
class FactorProfile:
    crop_name: str
    years: tuple[int, int]
    n: int
    sigma_income: float
    # 소득 변동에 대한 기여도 (합이 1 에 가까움)
    share_price: float
    share_quantity: float
    share_cost: float
    residual: float
    # 부수 산출
    elasticity: float        # 가격 1% 변화당 수량 반응 (회귀 기울기)
    correlation: float       # 가격-수량 상관계수
    leverage_revenue: float  # 총수입/소득
    leverage_cost: float     # 경영비/소득
    sigma_price: float
    sigma_quantity: float
    sigma_cost: float

    @property
    def driver(self) -> str:
        """가장 큰 기여 요인. 화면에서 처방을 고르는 데 쓴다."""
        return max(
            (("price", self.share_price), ("quantity", self.share_quantity),
             ("cost", abs(self.share_cost))),
            key=lambda kv: kv[1],
        )[0]

    def as_crop_fields(self) -> dict:
        return {
            "driver": self.driver,
            "share_price": round(self.share_price, 3),
            "share_quantity": round(self.share_quantity, 3),
            "share_cost": round(self.share_cost, 3),
            "residual": round(self.residual, 3),
            "elasticity": round(self.elasticity, 3),
            "correlation": round(self.correlation, 3),
            "sigma_price": round(self.sigma_price, 4),
            "sigma_quantity": round(self.sigma_quantity, 4),
            "n": self.n,
            "years": list(self.years),
        }


def _aligned(rows: list[IncomeRow], crop_name: str) -> tuple[list[int], dict[str, np.ndarray]] | None:
    """다섯 비목이 모두 있는 연도만 남겨 정렬한다."""
    series = {k: dict(series_for(rows, crop_name, k) if k in ("income", "cost")
                      else _raw_series(rows, crop_name, label))
              for k, label in REQUIRED.items()}
    common = set.intersection(*(set(s) for s in series.values())) if series else set()
    years = sorted(common)
    if len(years) < MIN_YEARS:
        return None
    return years, {k: np.array([series[k][y] for y in years], dtype=float) for k in series}


def _raw_series(rows: list[IncomeRow], crop_name: str, label: str) -> list[tuple[int, float]]:
    """series_for 의 별칭 매핑을 거치지 않고 비목명 그대로 뽑는다."""
    from .kosis import _normalize

    key = _normalize(crop_name)
    picked: dict[int, float] = {}
    for r in rows:
        if _normalize(r.crop_name) == key and r.item == label:
            picked[r.year] = r.value
    return sorted(picked.items())


def decompose(rows: list[IncomeRow], crop_name: str) -> FactorProfile | None:
    aligned = _aligned(rows, crop_name)
    if aligned is None:
        return None
    years, s = aligned
    income, revenue, cost = s["income"], s["revenue"], s["cost"]
    if (income <= 0).any() or (revenue <= 0).any():
        return None

    # 레버리지 계수 — 기간 평균 비중
    a = float((revenue / income).mean())
    b = float((cost / income).mean())

    def dlog(x: np.ndarray) -> np.ndarray:
        return np.diff(np.log(np.maximum(x, 1.0)))

    di = dlog(income)
    var = float(np.var(di, ddof=1))
    if var <= 0:
        return None

    dp, dq, dc, dr = dlog(s["price"]), dlog(s["quantity"]), dlog(cost), dlog(revenue)
    proj = lambda x, w: w * float(np.cov(di, x)[0, 1]) / var

    share_price = proj(dp, a)
    share_quantity = proj(dq, a)
    share_cost = proj(dc, -b)
    share_revenue = proj(dr, a)
    # 총수입 기여 중 가격·수량으로 설명되지 않는 몫(부산물·품목구성) + 선형근사 오차
    residual = 1.0 - (share_price + share_quantity + share_cost)

    # 가격이나 수량이 전혀 움직이지 않으면 탄력성·상관은 정의되지 않는다.
    var_p, var_q = float(np.var(dp, ddof=1)), float(np.var(dq, ddof=1))
    elasticity = float(np.cov(dq, dp)[0, 1] / var_p) if var_p > 0 else 0.0
    correlation = (
        float(np.corrcoef(dp, dq)[0, 1]) if var_p > 0 and var_q > 0 else 0.0
    )

    return FactorProfile(
        crop_name=crop_name,
        years=(years[0], years[-1]),
        n=len(years),
        sigma_income=float(np.std(di, ddof=1)),
        share_price=share_price,
        share_quantity=share_quantity,
        share_cost=share_cost,
        residual=residual,
        elasticity=elasticity,
        correlation=correlation,
        leverage_revenue=a,
        leverage_cost=b,
        sigma_price=float(np.std(dp, ddof=1)),
        sigma_quantity=float(np.std(dq, ddof=1)),
        sigma_cost=float(np.std(dc, ddof=1)),
    )


def decompose_all(rows: list[IncomeRow]) -> dict[str, FactorProfile]:
    out: dict[str, FactorProfile] = {}
    for crop in sorted({r.crop_name for r in rows if r.crop_name}):
        profile = decompose(rows, crop)
        if profile is not None:
            out[crop] = profile
    return out


def median_elasticity(profiles: dict[str, FactorProfile]) -> float:
    """작목 전체의 대표 탄력성. 개별 작목 추정이 없을 때의 기본값."""
    values = [p.elasticity for p in profiles.values()]
    return float(np.median(values)) if values else 0.0
