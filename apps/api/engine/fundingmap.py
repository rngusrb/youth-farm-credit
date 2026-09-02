"""engine/fundingmap.py — 25년 자금지도: 언제 무엇이 바뀌는가.

## 왜 필요한가

이 서비스의 핵심 주장이 한 문장으로 있다 —
**"5년 거치 뒤 6년차에 원금 상환이 한 번에 시작된다."**
그런데 지금은 그게 숫자로만 있고 한눈에 안 보인다. 연 단위 표로는 "언제부터 위험해지는지"가
읽히지 않는다.

이 모듈은 그 한 장을 그릴 재료를 만든다. **화면은 계산하지 않고 이 값을 그리기만 한다.**

## 여기서 만드는 것

연도별로: 상환액 · 거치 여부 · 상환여력 대비 비율 · 그 해 부족 확률.
그리고 **분기점 세 개** — 거치 종료, 상환액이 상환여력을 넘는 해, 부족 확률이 기준을 넘는 해.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .diagnose import DiagnoseInput, resolve_sigma
from .income import resolve_income
from .loan import repayment_schedule
from .params import get_crop, get_product
from .simulate import draw_paths


@dataclass(frozen=True)
class YearPoint:
    year: int
    due: float                 # 그 해 상환액 (원금+이자)
    is_grace: bool
    capacity: float            # 상환에 쓸 수 있는 돈 (중앙값 기준)
    coverage: float            # capacity / due — 1 미만이면 그 해는 모자란다
    shortfall_prob: float      # 그 해 상환액을 못 내는 시뮬레이션 비율


@dataclass(frozen=True)
class Milestone:
    year: int | None
    kind: str
    label: str


def funding_map(inp: DiagnoseInput, principal: float,
                sigma_override: float | None = None) -> dict:
    """연도별 상환 부담과 분기점.

    shortfall_prob 는 몬테카를로 경로에서 '그 해 소득 - 고정지출 < 상환액' 인 비율이다.
    2년연속 위기확률(crisis_prob)과 다른 지표다 — 그건 판정용이고 이건 **시점**을 본다.
    """
    if principal <= 0:
        raise ValueError("principal 은 0보다 커야 한다")

    crop = get_crop(inp.crop_id)
    product = get_product(inp.product_id)
    # 진단과 **같은 경로**로 소득·σ 를 정한다. 여기서 annual_income 을 직접 부르면
    # 실적을 넣은 농가가 진단과 다른 소득으로 25년 지도를 보게 된다 —
    # levers.py 가 2026-09-02 에 고친 바로 그 버그를 여기만 안 고치고 있었다.
    # (진단 9,100만원 / 자금지도 6,005만원. 적대적 리뷰 H1, 2026-09-02)
    income, income_meta = resolve_income(inp.crop_id, inp.pyeong, inp.income_history)
    if sigma_override is not None:
        sigma = sigma_override
    else:
        sigma, _ = resolve_sigma(crop, inp.income_history)
    fixed = inp.living_cost + inp.other_debt_service

    due = repayment_schedule(principal, product)
    paths = draw_paths(income, sigma, product)
    # (n_sim, T) 소득에서 고정지출을 뺀 상환 가용액
    available = paths.income - fixed

    points: list[YearPoint] = []
    for i, amount in enumerate(due):
        amount = float(amount)
        col = available[:, i] if i < available.shape[1] else available[:, -1]
        points.append(YearPoint(
            year=i + 1,
            due=amount,
            is_grace=i < product.grace_years,
            capacity=float(np.median(col)),
            coverage=(float(np.median(col)) / amount) if amount else float("inf"),
            shortfall_prob=float((col < amount).mean()),
        ))

    grace_end = product.grace_years
    jump = next((p for p in points if not p.is_grace), None)
    first_tight = next((p for p in points if p.coverage < 1.0), None)
    first_risky = next((p for p in points if p.shortfall_prob >= 0.20), None)

    milestones = [
        Milestone(grace_end, "grace_end",
                  f"{grace_end}년차까지는 이자만 냅니다"),
        Milestone(jump.year if jump else None, "principal_starts",
                  (f"{jump.year}년차부터 원금이 붙어 상환액이 "
                   f"{jump.due / points[0].due:.1f}배가 됩니다") if jump and points[0].due else ""),
        Milestone(first_tight.year if first_tight else None, "capacity_short",
                  (f"{first_tight.year}년차에 상환액이 상환여력을 넘어섭니다")
                  if first_tight else "상환여력이 상환액을 계속 웃돕니다"),
        Milestone(first_risky.year if first_risky else None, "risk_threshold",
                  (f"{first_risky.year}년차에 그 해 부족 확률이 20%를 넘습니다")
                  if first_risky else "그 해 부족 확률이 20%를 넘는 해가 없습니다"),
    ]

    return {
        "principal": principal,
        "crop_name": crop.name,
        # 어느 소득을 썼는지 밝힌다 — 화면이 진단과 같은 기준임을 보일 수 있어야 한다
        "income": {"annual": income, **income_meta},
        "grace_years": product.grace_years,
        "term_years": len(points),
        "years": [vars(p) for p in points],
        "milestones": [vars(m) for m in milestones],
        "note": ("그 해 부족 확률은 '소득 - 생활비 - 기존부채 < 그 해 상환액' 인 "
                 "시뮬레이션 비율입니다. 2년연속 위기확률과는 다른 지표로, "
                 "여기서는 **언제** 부담이 커지는지를 봅니다."),
    }
