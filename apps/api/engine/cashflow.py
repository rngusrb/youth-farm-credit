"""월별 현금흐름 (core).

연 단위 계산만으로는 보이지 않는 것이 있다. 농업 소득은 수확기 1~2회에
몰려 들어오는데 생활비와 경영비는 매달 나간다. 그래서 **연간으로는 흑자인
농가가 특정 달에 현금이 마르는** 일이 생긴다. 이 모듈이 그 시점을 짚는다.

모델은 단순하고, 단순하다는 사실을 숨기지 않는다.

  수입   총수입을 출하월에 배분한다. 출하월을 모르면 12개월 균등 — 이때는
         `harvest_known=False` 로 표시해 화면이 "미상" 이라고 말하게 한다.
  경영비 12개월 균등. 실제로는 정식·자재 구입이 앞에 몰리지만, 지침·통계
         어디에도 월별 경영비 배분이 없어서 지어내지 않는다.
  생활비 12개월 균등.
  상환   연 1회 후취 (시행지침 Ⅱ-2-1 '이자는 연 1회 후취'). 마지막 출하월
         다음 달에 낸다 — 수확 대금으로 갚는 것이 실제 순서다.
"""
from __future__ import annotations

from dataclasses import dataclass

MONTHS = 12


@dataclass(frozen=True)
class MonthFlow:
    month: int          # 1~12
    revenue: float      # 총수입 유입
    operating: float    # 경영비 유출
    living: float       # 생활비 유출
    debt: float         # 원리금 유출
    net: float          # 당월 순현금
    balance: float      # 누적 잔고 (연초 0 기준)


@dataclass(frozen=True)
class CashflowYear:
    months: tuple[MonthFlow, ...]
    harvest_known: bool
    harvest_months: tuple[int, ...]
    trough_month: int          # 누적 잔고가 가장 낮은 달
    trough_balance: float      # 그때의 잔고 (음수면 운전자금 부족)
    working_capital_need: float  # 그 부족분을 메우는 데 필요한 금액 (0 이상)
    annual_net: float


def _spread(total: float, months: tuple[int, ...]) -> list[float]:
    """total 을 지정한 달에 균등 배분한다."""
    out = [0.0] * MONTHS
    if not months:
        return out
    each = total / len(months)
    for m in months:
        out[m - 1] += each
    return out


def monthly_cashflow(
    *,
    gross: float,
    operating_cost: float,
    living_cost: float,
    debt_payment: float,
    harvest_months: tuple[int, ...] = (),
) -> CashflowYear:
    """한 해의 월별 현금흐름.

    gross/operating_cost 는 연 총수입·경영비(원). debt_payment 는 그 해 상환액.
    """
    known = bool(harvest_months)
    hm = tuple(sorted(set(harvest_months))) if known else tuple(range(1, MONTHS + 1))

    revenue = _spread(gross, hm)
    operating = _spread(operating_cost, tuple(range(1, MONTHS + 1)))
    living = _spread(living_cost, tuple(range(1, MONTHS + 1)))

    # 상환은 마지막 출하월 다음 달. 수확 대금이 들어온 직후다.
    debt = [0.0] * MONTHS
    pay_month = (hm[-1] % MONTHS) + 1 if known else 12
    debt[pay_month - 1] = debt_payment

    flows: list[MonthFlow] = []
    balance = 0.0
    for i in range(MONTHS):
        net = revenue[i] - operating[i] - living[i] - debt[i]
        balance += net
        flows.append(
            MonthFlow(
                month=i + 1,
                revenue=revenue[i],
                operating=operating[i],
                living=living[i],
                debt=debt[i],
                net=net,
                balance=balance,
            )
        )

    trough = min(flows, key=lambda f: f.balance)
    return CashflowYear(
        months=tuple(flows),
        harvest_known=known,
        harvest_months=hm if known else (),
        trough_month=trough.month,
        trough_balance=trough.balance,
        working_capital_need=max(0.0, -trough.balance),
        annual_net=flows[-1].balance,
    )


# ── 고수준 조립 (엔드포인트와 도구가 공유한다) ─────────────────────────────
# main.py 와 engine/tools.py 가 각자 조립하면 두 벌이 되고 반드시 갈라진다.
# 계산 경로는 하나만 둔다.

def cashflow_for(inp, principal: float, year: int = 1) -> dict:
    """진단 입력 + 원금 → 그 해의 월별 현금흐름 (화면·도구 공용).

    작목에 총수입·경영비가 없으면 InsufficientCropData 를 던진다. 추정해 넣지 않는다.
    """
    from .errors import InsufficientCropData
    from .loan import repayment_schedule
    from .params import get_crop, get_product, unit_area_pyeong

    crop = get_crop(inp.crop_id)
    product = get_product(inp.product_id)
    if not crop.gross_per_10a or not crop.cost_per_10a:
        raise InsufficientCropData(crop.name, "총수입·경영비")

    units = inp.pyeong / unit_area_pyeong()
    due = repayment_schedule(principal, product)
    year_idx = min(max(year, 1), len(due)) - 1
    cf = monthly_cashflow(
        gross=crop.gross_per_10a * units,
        operating_cost=crop.cost_per_10a * units,
        living_cost=inp.living_cost,
        debt_payment=float(due[year_idx]) + inp.other_debt_service,
        harvest_months=crop.harvest_months,
    )
    from dataclasses import asdict
    return {
        "crop": {"id": crop.id, "name": crop.name, "cashflow_year": crop.cashflow_year,
                 "income_year": crop.income_year,
                 "rescaled": bool(getattr(crop, "cashflow_rescaled", False))},
        "year": year_idx + 1,
        "is_grace_year": year_idx < product.grace_years,
        "annual": {
            "gross": crop.gross_per_10a * units,
            "operating_cost": crop.cost_per_10a * units,
            "income": (crop.gross_per_10a - crop.cost_per_10a) * units,
            "living_cost": inp.living_cost,
            "debt_payment": float(due[year_idx]),
            "other_debt_service": inp.other_debt_service,
        },
        "harvest_known": cf.harvest_known,
        "harvest_months": list(cf.harvest_months),
        "trough_month": cf.trough_month,
        "trough_balance": cf.trough_balance,
        "working_capital_need": cf.working_capital_need,
        "annual_net": cf.annual_net,
        "months": [asdict(m) for m in cf.months],
        "note": (
            "총수입은 출하월에, 경영비·생활비는 12개월 균등으로 배분합니다. "
            "월별 경영비 배분에 대한 공개 통계가 없어 균등으로 두며, 지어내지 않습니다. "
            "상환은 시행지침 '이자는 연 1회 후취'에 따라 마지막 출하월 다음 달로 봅니다."
        ),
    }
