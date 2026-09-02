"""작목 · 면적 → 연 농업소득."""
from __future__ import annotations

import math

from .params import get_crop, unit_area_pyeong


def annual_income(crop_id: str, pyeong: float) -> float:
    """income_per_10a * (pyeong / 302.5)"""
    if pyeong < 0:
        raise ValueError("pyeong must be non-negative")
    return get_crop(crop_id).income_per_10a * (pyeong / unit_area_pyeong())


def pyeong_for_income(crop_id: str, target_income: float) -> float:
    """목표 소득을 내려면 몇 평이 필요한가 (annual_income 의 역함수)."""
    return target_income / get_crop(crop_id).income_per_10a * unit_area_pyeong()


# 표준정규 80% 중앙구간의 경계. simulate.draw_paths 와 같은 분포를 쓴다.
_Z80 = 1.2815515655446004


def income_band(expected_income: float, sigma: float) -> tuple[float, float]:
    """평년 소득이 흔들리는 범위 (하위 10% ~ 상위 10%).

    화면이 "σ 0.215" 대신 "4,700만~7,200만원 사이" 라고 말할 수 있게 엔진이 낸다.
    σ 를 화면에서 ±% 로 환산하면 그건 화면이 만든 숫자다 — 여기서 만든다.

    분포는 시뮬레이터와 **같은 것**을 쓴다:
        shock = exp(σ·Z − σ²/2),  income = expected_income × shock
    (`simulate.draw_paths` 참조. 여기가 어긋나면 리포트와 화면이 다른 말을 한다.)
    """
    if expected_income <= 0 or sigma <= 0:
        return (expected_income, expected_income)
    half = math.exp(-0.5 * sigma**2)
    lo = expected_income * math.exp(-_Z80 * sigma) * half
    hi = expected_income * math.exp(+_Z80 * sigma) * half
    return (lo, hi)


#: 소득 수준을 실적으로 갈아탈 최소 연수. σ 축소추정과 같은 기준을 쓴다.
MIN_ACTUAL_YEARS = 3


def resolve_income(crop_id: str, pyeong: float,
                   income_history: tuple[float, ...] = (),
                   history_pyeong: float | None = None) -> tuple[float, dict]:
    """진단이 쓸 연간 농업소득과 그 출처.

    ## 왜 섞지 않나

    σ 는 작목 통계를 사전분포로 두고 개인 이력과 **섞는다**(estimators/shrinkage.py).
    관측 4개짜리 표본표준편차가 실제로 못 쓸 물건이고, 섞는 비율(ν₀)에 켤레사전분포라는
    근거가 있기 때문이다.

    **소득 수준에는 그 근거가 없다.** 섞으려면 '농가 간 소득이 얼마나 흩어져 있는가'가
    필요한데 우리 데이터에 그 값이 없다 — 우리가 가진 σ 는 연도 간 변동이지 농가 간
    변동이 아니다. 없는 분산을 가정해 가중치를 만들면 그건 지어낸 숫자다.

    그래서 갈아탄다: 실적이 MIN_ACTUAL_YEARS 년 이상이면 **실적 평균**, 아니면
    **작목 통계 추정치**. 어느 쪽을 썼는지 항상 밝힌다.

    ## 이걸 왜 만들었나

    사고 이력 2026-09-02: 실적을 넣어도 진단은 계속 추정치를 "내 소득"이라고 불렀다.
    그래서 농가가 한 화면에서 **"내 소득 6,304만원"과 "내 소득은 평균의 77%(4,833만원)"**
    를 동시에 봤다. 엔진은 일관됐지만 화면이 모순됐다 — 실적을 받아 놓고 σ 에만 쓰고
    수준에는 안 썼기 때문이다.
    """
    crop_average = annual_income(crop_id, pyeong)
    years = tuple(float(v) for v in income_history if v and v > 0)

    if len(years) >= MIN_ACTUAL_YEARS:
        actual = sum(years) / len(years)
        # 실적은 **그 면적에서 낸 돈**이다. 다른 면적을 물으면 면적당으로 환산한다.
        # 작목 통계도 면적에 선형이므로(annual_income = income_per_10a × pyeong/302.5)
        # 같은 가정을 쓴다. 규모의 경제·불경제는 반영하지 않는다 — 근거가 없다.
        #
        # 사고 이력 2026-09-02: 이 환산이 없을 때 **면적을 두 배로 해도 소득이
        # 그대로**였다. 그러면 "면적을 늘리면 된다"는 레버가 통째로 죽는다.
        base = history_pyeong if (history_pyeong and history_pyeong > 0) else pyeong
        scaled = actual * (pyeong / base) if base else actual
        note = (f"최근 {len(years)}개년 실적 평균을 씁니다. "
                f"작목 통계 추정치({crop_average:,.0f}원)는 견주는 기준으로만 씁니다.")
        if abs(scaled - actual) > 1:
            note = (f"최근 {len(years)}개년 실적({actual:,.0f}원, {base:,.0f}평)을 "
                    f"{pyeong:,.0f}평으로 환산한 값입니다. 면적에 비례한다고 봅니다.")
        return scaled, {
            "source": "ACTUAL",
            "actual_mean": actual,
            "actual_pyeong": base,
            "crop_average": crop_average,
            "years": len(years),
            "note": note,
        }

    return crop_average, {
        "source": "CROP_AVERAGE",
        "actual_mean": (sum(years) / len(years)) if years else None,
        "actual_pyeong": None,
        "crop_average": crop_average,
        "years": len(years),
        "note": (f"실적이 {MIN_ACTUAL_YEARS}개년 미만이라 작목 통계로 추정했습니다. "
                 f"실적을 넣으면 그 값으로 다시 계산합니다."),
    }
