"""영업레버리지와 분산분해.

가격 통계는 품목 단위라 수경·토경을 구분하지 못한다. 하지만 **가격은 원래
재배방식과 무관하다** — 도매시장에서 수경 딸기와 토경 딸기가 다른 값에 팔리지
않는다. 재배방식이 갈리는 곳은 비용 구조다.

    소득 = 조수입 − 경영비
    DOL(영업레버리지도) = 1 + 고정비/소득 = 조수입/소득  (경영비 전액을 고정비로 볼 때)
    σ_소득 ≈ DOL × σ_조수입

수경은 양액설비·난방으로 고정비가 크므로 DOL 이 높고, 같은 가격 충격에도 소득이
더 크게 흔들린다. 즉 **가격 계열을 공유해도 재배방식별 σ 는 달라진다.**
필요한 입력은 작목별 조수입·경영비 두 숫자뿐이고, 둘 다 농산물소득조사 공표값이다.

분산분해도 여기서 한다.

    σ_개별² = σ_공통² + σ_고유²

  σ_공통 : 전국이 같이 겪는 시장 충격. KAMIS 일별 가격(관측 수천)에서 정밀하게 잰다.
  σ_고유 : 농가별 특이 충격. 전국 평균 시계열에서는 상쇄돼 보이지 않는다.

공표 평균 시계열에서 잰 σ 는 σ_공통 쪽에 가깝고, 개별 농가가 겪는 변동의 하한이다.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

# 경영비 중 고정비 비중. 시설재배는 감가상각·난방·양액설비 비중이 커서 높다.
# 소득조사가 고정비/변동비를 분리 공표하지 않을 때 쓰는 기본값이며, 그 자체가 가정이다.
DEFAULT_FIXED_COST_SHARE = 1.0


@dataclass(frozen=True)
class Leverage:
    dol: float
    gross_per_10a: float
    cost_per_10a: float
    income_per_10a: float
    fixed_cost_share: float

    def apply(self, revenue_sigma: float) -> float:
        """조수입 변동성 → 소득 변동성."""
        return abs(revenue_sigma) * self.dol


def degree_of_operating_leverage(
    gross: float,
    cost: float,
    fixed_cost_share: float = DEFAULT_FIXED_COST_SHARE,
) -> Leverage:
    """조수입·경영비 → 영업레버리지도.

    fixed_cost_share=1.0 이면 경영비를 전액 고정비로 보아 DOL=조수입/소득 이 되고,
    이는 레버리지의 **상한**이다. 변동비 비중을 알면 낮춰 잡을 수 있다.
    """
    if gross <= 0:
        raise ValueError("조수입은 양수여야 합니다")
    income = gross - cost
    if income <= 0:
        raise ValueError("소득이 0 이하입니다 — 레버리지가 정의되지 않습니다")
    fixed = cost * max(0.0, min(fixed_cost_share, 1.0))
    return Leverage(
        dol=1.0 + fixed / income,
        gross_per_10a=gross,
        cost_per_10a=cost,
        income_per_10a=income,
        fixed_cost_share=fixed_cost_share,
    )


def decompose(total_sigma: float, common_sigma: float) -> float:
    """σ_개별 과 σ_공통 에서 σ_고유 를 뽑는다.

    측정 오차 탓에 공통 성분이 총 변동을 넘어설 수 있다. 그때는 0 으로 막는다
    (음수 분산을 만들지 않는다).
    """
    residual = total_sigma ** 2 - common_sigma ** 2
    return math.sqrt(residual) if residual > 0 else 0.0


def combine(common_sigma: float, idiosyncratic_sigma: float) -> float:
    """독립 가정 하에 두 성분을 합친다."""
    return math.hypot(common_sigma, idiosyncratic_sigma)


def lift_national_average(
    national_sigma: float,
    idiosyncratic_sigma: float,
) -> float:
    """전국 평균에서 잰 σ 에 농가 고유 변동을 얹어 개별 농가 σ 로 올린다.

    공표 평균 시계열만 쓰면 개별 농가가 겪는 변동을 과소평가한다. 고유 성분을
    따로 추정했을 때만 이 보정을 적용하고, 추정치에는 근거를 함께 기록한다.
    """
    return combine(national_sigma, idiosyncratic_sigma)


def implied_idiosyncratic_from_leverage(
    national_income_sigma: float,
    price_sigma: float,
    leverage: Leverage,
) -> float:
    """가격 σ 와 레버리지로 설명되는 몫을 빼고 남는 것을 고유 성분으로 본다.

    KAMIS 가격(관측 수천)이 시장 성분을 정밀하게 주고, 소득조사 평균 시계열
    (관측 20 내외)이 총량을 준다. 둘의 차이가 곧 평균에 남아 있는 비시장 변동이다.
    """
    explained = leverage.apply(price_sigma)
    return decompose(national_income_sigma, explained)
