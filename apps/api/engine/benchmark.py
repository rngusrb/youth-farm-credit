"""engine/benchmark.py — 전국 작목 평균 대비 내 농장 위치.

## "유사 농가 비교"가 아니다

개별 농가 데이터가 없다. 우리가 가진 건 KOSIS 농산물소득조사의 **작목별 평균**이다.
조사 통계라 평균 자체는 진짜지만, "비슷한 농가와 비교했다"고 말하면 거짓이 된다.
그래서 문구를 **"전국 ○○ 농가 평균 대비"** 로 고정한다.

## 실적이 없으면 비교하지 않는다

사용자가 연도별 소득을 안 넣으면 우리는 소득을 *작목평균 × 면적* 으로 추정한다.
**그 추정치를 평균과 비교하면 항상 100% 가 나온다** — 자기 자신과 비교하는 것이다.
그럴듯한 숫자가 나오지만 아무 정보도 없다. 그래서 실적이 없으면 `comparable=False` 로
돌려주고 화면이 입력을 유도하게 한다. 없는 비교를 지어내지 않는다.

실적이 없어도 **작목 특성**(경영비 비율·변동성 순위·변동 요인)은 유효하다. 그건 준다.
"""
from __future__ import annotations

from dataclasses import dataclass

from .errors import InsufficientCropData
from .income import annual_income
from .params import crops, get_crop

#: 비교에 필요한 최소 실적 연수. 1~2년은 풍흉 한 번에 흔들려 위치를 말할 수 없다.
MIN_YEARS = 3

DRIVER_LABEL = {
    "price": "가격",
    "quantity": "생산량",
    "cost": "경영비",
}


@dataclass(frozen=True)
class CropTraits:
    """실적이 없어도 말할 수 있는 것 — 작목 자체의 성질."""

    cost_ratio: float | None
    sigma: float
    sigma_rank: int          # 낮을수록 안정적 (1위 = 가장 안정)
    sigma_total: int
    driver: str | None       # 소득 변동을 가장 크게 움직이는 요인
    driver_label: str | None
    income_year: int | None


def crop_traits(crop_id: str) -> CropTraits:
    c = get_crop(crop_id)
    ranked = sorted((x for x in crops().values() if x.sigma), key=lambda x: x.sigma)
    rank = next((i + 1 for i, x in enumerate(ranked) if x.id == c.id), 0)
    gross, cost = c.gross_per_10a, c.cost_per_10a
    driver = (c.factors or {}).get("driver") if c.factors else None
    return CropTraits(
        cost_ratio=(cost / gross) if (gross and cost) else None,
        sigma=float(c.sigma),
        sigma_rank=rank,
        sigma_total=len(ranked),
        driver=driver,
        driver_label=DRIVER_LABEL.get(driver or ""),
        income_year=c.income_year,
    )


def benchmark(crop_id: str, pyeong: float,
              actual_income: tuple[float, ...] = ()) -> dict:
    """전국 작목 평균 대비 내 농장 소득 위치.

    실적(actual_income)이 MIN_YEARS 미만이면 비교하지 않고 이유를 돌려준다.
    """
    c = get_crop(crop_id)
    traits = crop_traits(crop_id)
    if not c.income_per_10a:
        raise InsufficientCropData(c.name, "작목 평균 소득")

    common = {
        "crop_id": c.id,
        "crop_name": c.name,
        "crop_traits": vars(traits),
        "source": "농촌진흥청 농산물소득조사(KOSIS)",
        "note": ("전국 같은 작목 농가의 평균과 견준 것입니다. "
                 "개별 농가끼리 비교한 것이 아닙니다."),
    }

    years = tuple(v for v in actual_income if v and v > 0)
    if len(years) < MIN_YEARS:
        return {
            **common,
            "comparable": False,
            "reason": "actual_income_required",
            "years_given": len(years),
            "years_required": MIN_YEARS,
            "message": (f"최근 {MIN_YEARS}개년 농업소득을 넣으면 전국 평균과 견줘 드려요. "
                        "지금은 작목 평균으로 추정하고 있어서, 그 값을 평균과 견주면 "
                        "언제나 100%가 나옵니다 — 자기 자신과 비교하는 셈이라 뜻이 없어요."),
        }

    mine = sum(years) / len(years)
    average = annual_income(crop_id, pyeong)
    return {
        **common,
        "comparable": True,
        "my_income": mine,
        "average_income": average,
        "ratio": (mine / average) if average else None,
        "years": len(years),
    }
