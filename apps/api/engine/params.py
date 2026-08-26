"""데이터/파라미터 로더.

crops.json · loan_products.json · policy.json 을 읽어 엔진 전역에서 쓰는
불변 객체로 노출한다. 모든 금액 단위는 '원'.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


@dataclass(frozen=True)
class LoanProduct:
    id: str
    name: str
    limit: float
    rate: float
    rate_type: str
    grace_years: int
    amort_years: int
    source: str
    # 상환 방식. 후계농 육성자금은 시행지침상 원금 균등분할이다.
    # 다른 상품이 원리금균등일 수 있어 상품별로 둔다.
    amort_method: str = "equal_principal"
    # 사람이 읽는 주석. 계산에는 안 쓰지만 화면에 상품 차이를 설명할 때 쓴다.
    note: str = ""

    @property
    def term_years(self) -> int:
        return self.grace_years + self.amort_years


@dataclass(frozen=True)
class Crop:
    id: str
    name: str
    income_per_10a: float
    sigma: float
    sigma_source: str
    aliases: tuple[str, ...] = ()
    harvest_months: tuple[int, ...] = ()
    # 아래는 stats.calibrate 가 실측으로 교체했을 때만 채워진다.
    sigma_ci: tuple[float, float] | None = None
    sigma_method: str | None = None
    sigma_reference: str | None = None
    # KAMIS(공공데이터포털 15156057) 품목 매핑. σ 실측 수집에만 쓴다.
    kamis: dict | None = None
    # KOSIS 농산물소득조사(orgId 143) 작목 매핑.
    kosis: dict | None = None
    # 실측된 공통(시장) 변동성. 농가 고유 성분과 합쳐 σ 가 된다.
    sigma_common: float | None = None
    # 소득 변동의 요인분해 (가격/수량/비용). stats/factors.py 산출.
    factors: dict | None = None
    # KAMIS 도매가 기반 시장 국면. 안내용이며 한도 계산에는 쓰지 않는다.
    market: dict | None = None


@dataclass(frozen=True)
class ReliefBand:
    damage_min: float
    damage_max: float
    defer_years: int


def _load(name: str):
    with open(DATA_DIR / name, encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def crops() -> dict[str, Crop]:
    raw = _load("crops.json")
    out: dict[str, Crop] = {}
    for c in raw["crops"]:
        if c["sigma_source"] not in ("ASSUMED", "MEASURED"):
            raise ValueError(f"sigma_source must be ASSUMED|MEASURED: {c['id']}")
        out[c["id"]] = Crop(
            id=c["id"],
            name=c["name"],
            income_per_10a=float(c["income_per_10a"]),
            sigma=float(c["sigma"]),
            sigma_source=c["sigma_source"],
            aliases=tuple(c.get("aliases", ())),
            harvest_months=tuple(c.get("harvest_months", ())),
            sigma_ci=tuple(c["sigma_ci"]) if c.get("sigma_ci") else None,
            sigma_method=c.get("sigma_method"),
            sigma_reference=c.get("sigma_reference"),
            kamis=c.get("kamis"),
            kosis=c.get("kosis"),
            sigma_common=c.get("sigma_common"),
            factors=c.get("factors"),
            market=c.get("market"),
        )
    return out


@lru_cache(maxsize=1)
def unit_area_pyeong() -> float:
    """10a 에 해당하는 평수."""
    return float(_load("crops.json")["unit_area_pyeong"])


@lru_cache(maxsize=1)
def crops_source() -> str:
    return _load("crops.json")["source"]


@lru_cache(maxsize=1)
def products() -> dict[str, LoanProduct]:
    return {p["id"]: LoanProduct(**p) for p in _load("loan_products.json")}


@lru_cache(maxsize=1)
def policy() -> dict:
    return _load("policy.json")


@lru_cache(maxsize=1)
def idiosyncratic_sigma() -> float:
    """농가 고유 변동성 — σ 에 남은 마지막 가정값."""
    return float(policy()["sigma_decomposition"]["idiosyncratic_sigma"])


@lru_cache(maxsize=1)
def relief_bands() -> tuple[ReliefBand, ...]:
    return tuple(ReliefBand(**b) for b in policy()["disaster_relief"])


@lru_cache(maxsize=1)
def sim_defaults() -> dict:
    return policy()["simulation"]


def get_crop(crop_id: str) -> Crop:
    try:
        return crops()[crop_id]
    except KeyError:
        raise KeyError(f"unknown crop_id: {crop_id}") from None


def get_product(product_id: str) -> LoanProduct:
    try:
        return products()[product_id]
    except KeyError:
        raise KeyError(f"unknown product_id: {product_id}") from None
