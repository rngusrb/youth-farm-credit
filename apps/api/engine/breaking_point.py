"""engine/breaking_point.py — 이 농가가 **어디까지 버티는가**.

## 왜 만들었나

안전진단은 지금까지 고정 시나리오 5개를 대입했다. 딸기 1,300평 실측:

```
가격 하락    소득 -49.2%  못 버팀
생산량 감소  소득 -73.9%  못 버팀
복합 충격    소득 -108.3% 못 버팀
```

거의 다 "못 버팀" 이다. 남의 가정으로 만든 충격이라 **이 농가에 얼마나 가까운
위험인지 알 수 없고**, 농가에게는 "그래서 어쩌라고" 가 남는다.

그래서 거꾸로 찾는다 — 시나리오를 대입하는 대신 **경계를 탐색한다.**

> 도매가가 지금보다 23% 떨어지는 데까지는 버팁니다.
> 그 아래로는 6년차에 무너집니다.

숫자 하나가 그 농가만의 것이고, "얼마나 그럴듯한 위험인가" 를 스스로 판단할 수 있다.

## 무엇을 하고 무엇을 하지 않나

**한다**: crisis_prob(2년 연속 상환 부족 확률)이 감내 기준을 넘는 지점을 이분법으로 찾는다.

**축은 하나다 — 총수입.** 가격과 수확량을 따로 내놓지 않는다. 이 모형에서 둘은
`gross × (1-가격하락) × (1-수확량하락)` 로 곱해 들어가므로 **수학적으로 구별되지
않는다** (가격 20% 하락 = 수확량 20% 하락, 같은 값). 경영비가 어느 쪽에서도 줄지
않는다고 보기 때문이다. 구별하려면 수확 관련 비용 비율이 필요한데 공개 근거가 없다.
두 축인 척 두 숫자를 내놓으면 없는 정보를 있는 것처럼 보이게 하는 것이라 하나만 낸다.

**하지 않는다**: 그 하락이 **얼마나 일어날 법한지는 말하지 않는다.** 경계값은
"버티는 한계" 이지 "예측" 이 아니다. 확률을 붙이려면 가격 분포 추정이 필요한데
그건 별개 문제이고, 여기서 지어내면 경계값의 신뢰까지 같이 잃는다.

**경계가 없을 수 있다.** 두 경우 다 그대로 밝힌다 —
어떤 하락에도 버티거나(`unbreakable`), 지금도 이미 못 버티거나(`already_over`).

## 왜 engine 에 있나

프롬프트도 네트워크도 환경변수도 없다. 몬테카를로와 이분법뿐이다.
설명 문장은 adapters 가 쓰고, 이 모듈은 숫자만 만든다.
"""
from __future__ import annotations

from dataclasses import dataclass

from .diagnose import DEFAULT_MAX_CRISIS_PROB, DiagnoseInput, resolve_sigma
from .income import resolve_income
from .params import get_crop, get_product
from .simulate import draw_paths, evaluate
from .stress import shocked_income
from .risk_limit import crisis_prob_at

#: 탐색 상한. 100% 하락은 소득이 0이 되는 지점이라 그 위는 볼 필요가 없다.
MAX_DROP = 1.0
#: 이분법 정지 폭. 0.5%p 보다 잘게 나눠 봐야 화면에서 반올림되어 사라진다.
TOLERANCE = 0.005


@dataclass(frozen=True)
class BreakingPoint:
    label: str                  # 무엇이 떨어지는가 — 총수입 하나뿐이다
    drop: float | None          # 버티는 최대 하락폭 (0.23 = 23%). None = 경계 없음
    status: str                 # "found" | "unbreakable" | "already_over"
    income_at_edge: float | None
    crisis_prob_now: float
    max_crisis_prob: float
    #: 경계 앞뒤 몇 지점의 (하락폭, 위기확률). **경계 다음이 얼마나 가파른지**를 보여준다.
    #: 처음엔 "몇 년차에 무너지나" 를 넣으려 했는데, 그 연차는 연간 부족확률 20%
    #: 기준이라 경계 근처에서는 늘 비어 있었다. 나타날 때는 이미 위기확률이
    #: 99.9% 라 "언제" 를 물을 상황이 아니다. 대신 절벽의 기울기를 보여준다.
    #: (딸기 1,300평 1억: 8.6%→8.6% / 12%→37.4% / 20%→99.9%)
    ladder: tuple[tuple[float, float], ...]
    note: str


#: 축은 하나다. 위 문서의 이유 참조 — 가격과 수확량이 모형에서 구별되지 않는다.
AXIS_LABEL = "총수입(가격 × 수확량)"


def find_breaking_point(inp: DiagnoseInput, principal: float, *,
                        max_crisis_prob: float | None = None) -> BreakingPoint:
    """총수입을 얼마나 떨어뜨리면 감내 기준을 넘는지 찾는다.

    결정론이다 — `draw_paths` 가 고정 시드를 쓰므로 같은 입력이면 같은 답이 나온다.
    (검사: tests/test_breaking_point.py::test_is_deterministic)
    """
    if principal <= 0:
        raise ValueError("principal 은 0보다 커야 한다")

    crop = get_crop(inp.crop_id)
    product = get_product(inp.product_id)
    if not crop.gross_per_10a or not crop.cost_per_10a:
        from .errors import InsufficientCropData
        raise InsufficientCropData(crop.name, "총수입·경영비")

    # 소득·σ 는 **진단과 같은 경로**로 정한다. 여기서 따로 구하면 같은 농가가
    # 화면마다 다른 소득으로 계산된다 — 이 계열 버그를 2026-09-02 에 세 번 고쳤다.
    income, _ = resolve_income(inp.crop_id, inp.pyeong, inp.income_history,
                               inp.income_history_pyeong)
    sigma, _ = resolve_sigma(crop, inp.income_history)
    fixed = inp.living_cost + inp.other_debt_service
    tolerance_prob = (inp.max_crisis_prob if max_crisis_prob is None else max_crisis_prob)
    if tolerance_prob is None:
        # 진단이 쓰는 것과 **같은 기본값**. 여기서 따로 정하면 같은 농가가
        # 화면마다 다른 잣대로 판정된다.
        tolerance_prob = DEFAULT_MAX_CRISIS_PROB

    # 총수입·경영비를 실제 소득 수준에 맞춘다. cashflow·stress 와 같은 방식이다 —
    # 경영비 비율은 작목 통계를 그대로 쓴다.
    units = inp.pyeong / _unit_area()
    gross = crop.gross_per_10a * units
    op_cost = crop.cost_per_10a * units
    crop_net = gross - op_cost
    scale = (income / crop_net) if crop_net else 1.0
    gross, op_cost = gross * scale, op_cost * scale

    def crisis_at(drop: float) -> float:
        shocked = shocked_income(gross=gross, operating_cost=op_cost, price_drop=drop)
        paths = draw_paths(shocked, sigma, product)
        return crisis_prob_at(paths, principal, fixed)

    now = crisis_at(0.0)
    if now > tolerance_prob:
        return BreakingPoint(
            label=AXIS_LABEL, drop=None, status="already_over",
            income_at_edge=None, crisis_prob_now=now, max_crisis_prob=tolerance_prob,
            ladder=(),
            note=(f"지금 시세에서도 이미 감내 기준({tolerance_prob:.0%})을 넘습니다. "
                  f"총수입이 떨어지는 것을 따지기 전에 차입 규모부터 봐야 합니다."),
        )
    if crisis_at(MAX_DROP) <= tolerance_prob:
        return BreakingPoint(
            label=AXIS_LABEL, drop=None, status="unbreakable",
            income_at_edge=None, crisis_prob_now=now, max_crisis_prob=tolerance_prob,
            ladder=(),
            note=(f"총수입이 전부 사라져도 감내 기준 안에 머뭅니다. "
                  f"이 차입 규모에서는 총수입 충격이 결정적이지 않습니다."),
        )

    lo, hi = 0.0, MAX_DROP          # lo: 버팀, hi: 못 버팀
    while hi - lo > TOLERANCE:
        mid = (lo + hi) / 2
        if crisis_at(mid) <= tolerance_prob:
            lo = mid
        else:
            hi = mid

    edge_income = shocked_income(gross=gross, operating_cost=op_cost, price_drop=lo)

    # 경계 다음이 얼마나 가파른지. 경계만 주면 "8.6% 까지 버틴다" 가 안심으로
    # 읽히는데, 실제로는 12% 에서 37%, 20% 에서 99.9% 로 절벽이다.
    # 경계에서 **몇 %p 씩 더** 떨어뜨려 본다. 배수(lo×1.5, lo×2.5)로 잡았더니
    # 경계가 0 인 농가에서 전부 0 으로 뭉개져 사다리가 두 줄로 쪼그라들었다.
    # 경계가 0 이든 8.6% 든 같은 간격으로 보여야 비교가 된다. (2026-09-06)
    ladder = tuple(
        (round(d, 3), crisis_at(d))
        for d in (lo, lo + 0.05, lo + 0.10, lo + 0.20)
        if d <= MAX_DROP
    )

    return BreakingPoint(
        label=AXIS_LABEL, drop=lo, status="found",
        income_at_edge=edge_income, crisis_prob_now=now,
        max_crisis_prob=tolerance_prob, ladder=ladder,
        note=(
            # 경계가 0에 가까우면 "여유가 없다" 가 핵심이다. 권장 차입(risk_based)은
            # **정의상** 위기확률이 기준에 정확히 닿는 금액이라 여기서 0% 가 나온다 —
            # 계산이 틀린 게 아니라 그 금액의 뜻이 그렇다. 그대로 두면 오해된다.
            (f"지금 차입 규모에서는 총수입이 조금만 떨어져도 감내 기준"
             f"({tolerance_prob:.0%})을 넘습니다. 권장 차입은 위기확률이 기준에 "
             f"정확히 닿는 금액이라, 그 금액을 다 빌리면 여유가 남지 않습니다.")
            if lo < TOLERANCE * 2 else
            (f"총수입이 지금보다 {lo:.0%} 떨어지는 데까지는 감내 기준"
             f"({tolerance_prob:.0%}) 안에서 버팁니다. 이 값은 '버티는 한계' 이지 "
             f"'그만큼 떨어진다는 예측' 이 아닙니다.")),
    )


def _unit_area() -> float:
    from .params import unit_area_pyeong
    return unit_area_pyeong()
