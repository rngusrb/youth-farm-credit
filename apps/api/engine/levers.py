"""engine/levers.py — 반사실 탐색: "원하는 금액을 받으려면 무엇이 얼마나 달라져야 하나".

기존 `risk_limit.limit_by_crisis_prob` 은 **원금**을 이분탐색해 "얼마까지 안전한가"를 답한다.
이 모듈은 반대 방향이다 — 금액을 고정하고 **나머지 변수**를 이분탐색해
"이 금액을 감당하려면 무엇이 얼마나 달라져야 하는가"를 답한다.

## 왜 여기(core)에 있나

탐색을 LLM 에게 시키지 않는다. LLM 이 탐색하면 같은 질문에 매번 다른 숫자가 나오고
재현이 안 된다. **LLM 은 '어떤 변수를 움직여볼지'만 고르고, 탐색은 이 결정론 코드가 한다.**
그래서 이 모듈에는 프롬프트도 외부 호출도 없다.

## 단조성 — 이분탐색이 성립하는 근거

`simulate.crisis_prob_at` 은 공통난수를 쓰므로 다음이 단조다.
- `fixed_outflow`(생활비+기존 부채상환) ↑  →  위기확률 ↑
- 소득 ↑ (면적 ↑)                        →  위기확률 ↓

생활비·부채는 `fixed_outflow` 만 바꾸므로 **소득 경로를 다시 생성하지 않는다**(빠르다).
면적은 소득이 바뀌므로 경로를 다시 만든다.

## 커트라인을 숨기지 않는다

"생활비를 절반으로 줄이세요"는 조언이 아니다. 그래서 탐색 범위를 제한하는데,
**그 범위를 결과에 실어 보낸다**(`searched_from`/`searched_to`). 화면이 "현재의 70%까지
탐색했습니다"라고 밝힐 수 있어야 한다 — 근거 없는 커트라인이 조용히 숨는 것을 막는다.
범위 자체는 호출자가 바꿀 수 있다.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .diagnose import DiagnoseInput
from .income import annual_income
from .params import get_crop, get_product
from .risk_limit import DEFAULT_MAX_CRISIS_PROB
from .simulate import crisis_prob_at, draw_paths

Variable = Literal["living_cost", "other_debt_service", "pyeong"]

#: 탐색 기본 범위 — 현재값 대비 배수. **모형 가정이지 제도 기준이 아니다.**
#: 여기 숫자는 "이보다 큰 변화는 조언이 아니다"라는 판단일 뿐이라 호출자가 바꿀 수 있고,
#: 실제로 쓴 범위는 Lever.searched_from/to 로 반환해 화면이 밝힐 수 있게 한다.
DEFAULT_BOUNDS: dict[str, tuple[float, float]] = {
    "living_cost": (0.60, 1.00),          # 생활비는 40%까지만 줄여 본다
    "other_debt_service": (0.00, 1.00),   # 기존 부채는 전액 상환까지 가능
    "pyeong": (1.00, 2.00),               # 면적은 2배까지만 늘려 본다
}

LABELS: dict[str, tuple[str, str]] = {
    "living_cost": ("연 생활비", "원"),
    "other_debt_service": ("기존 연 부채상환액", "원"),
    "pyeong": ("재배 면적", "평"),
}

TOLERANCE: dict[str, float] = {
    "living_cost": 100_000.0,
    "other_debt_service": 100_000.0,
    "pyeong": 10.0,
}


@dataclass(frozen=True)
class Lever:
    """한 변수를 얼마나 움직이면 목표 금액이 감당 가능해지는가."""

    variable: str
    label: str
    unit: str
    from_value: float
    to_value: float | None          # None = 탐색 범위 안에서 달성 불가
    delta_ratio: float | None       # to/from - 1 (음수면 감소)
    crisis_prob_before: float
    crisis_prob_after: float | None
    reachable: bool
    searched_from: float            # 실제로 탐색한 범위 (커트라인을 숨기지 않는다)
    searched_to: float
    note: str


def _crisis_at(
    inp: DiagnoseInput,
    principal: float,
    *,
    living_cost: float | None = None,
    other_debt: float | None = None,
    pyeong: float | None = None,
    sigma_override: float | None = None,
) -> float:
    """지정한 변수만 바꿔 2년연속 부족확률을 잰다.

    생활비·부채만 바뀌면 소득 경로는 그대로다 — 경로 재생성을 건너뛴다.
    """
    crop = get_crop(inp.crop_id)
    product = get_product(inp.product_id)
    use_pyeong = inp.pyeong if pyeong is None else pyeong
    income = annual_income(inp.crop_id, use_pyeong)
    sigma = sigma_override if sigma_override is not None else float(crop.sigma)
    paths = draw_paths(income, sigma, product)
    fixed = (inp.living_cost if living_cost is None else living_cost) + (
        inp.other_debt_service if other_debt is None else other_debt
    )
    return crisis_prob_at(paths, principal, fixed)


def _bisect(
    lo: float,
    hi: float,
    tolerance: float,
    prob_at: "callable[[float], float]",
    max_prob: float,
    *,
    lower_is_better: bool,
) -> float | None:
    """목표를 만족하는 **가장 덜 움직인** 값을 찾는다.

    lower_is_better=True  : 값을 낮출수록 좋아진다 (생활비·부채) → 최댓값을 찾는다
    lower_is_better=False : 값을 높일수록 좋아진다 (면적)       → 최솟값을 찾는다
    """
    best_end = lo if lower_is_better else hi     # 가장 많이 움직인 쪽
    if prob_at(best_end) > max_prob:
        return None                              # 끝까지 움직여도 달성 불가

    worst_end = hi if lower_is_better else lo    # 안 움직인 쪽
    if prob_at(worst_end) <= max_prob:
        return worst_end                         # 움직일 필요 없음

    a, b = best_end, worst_end                   # a: 만족, b: 불만족
    while abs(b - a) > tolerance:
        mid = (a + b) / 2
        if prob_at(mid) <= max_prob:
            a = mid
        else:
            b = mid
    return a


def solve_for(
    inp: DiagnoseInput,
    target_principal: float,
    movables: tuple[str, ...] = ("living_cost", "other_debt_service", "pyeong"),
    max_crisis_prob: float = DEFAULT_MAX_CRISIS_PROB,
    bounds: dict[str, tuple[float, float]] | None = None,
    sigma_override: float | None = None,
) -> list[Lever]:
    """목표 금액을 감당 가능하게 만드는 **변수별 최소 변화량**.

    movables 에 넣은 변수만 탐색한다 — 면적을 늘릴 수 없는 농가에게 면적 조정을
    제안하는 것은 조언이 아니므로, 무엇을 움직일 수 있는지는 호출자가 정한다.

    달성 불가한 변수는 reachable=False 로 돌려준다. 억지로 답을 만들지 않는다.
    """
    if target_principal <= 0:
        raise ValueError("target_principal 은 0보다 커야 한다")
    b = {**DEFAULT_BOUNDS, **(bounds or {})}

    before = _crisis_at(inp, target_principal, sigma_override=sigma_override)
    out: list[Lever] = []

    for var in movables:
        if var not in b:
            raise ValueError(f"알 수 없는 변수: {var} (가능: {sorted(b)})")
        current = {
            "living_cost": inp.living_cost,
            "other_debt_service": inp.other_debt_service,
            "pyeong": inp.pyeong,
        }[var]
        lo_r, hi_r = b[var]
        lo, hi = current * lo_r, current * hi_r
        lower_is_better = var != "pyeong"

        def prob_at(v: float, _var=var) -> float:
            kw = {"living_cost": None, "other_debt": None, "pyeong": None}
            kw["other_debt" if _var == "other_debt_service" else _var] = v
            return _crisis_at(inp, target_principal, sigma_override=sigma_override, **kw)

        label, unit = LABELS[var]

        if current <= 0 and lower_is_better:      # 이미 0이면 더 줄일 수 없다
            out.append(Lever(var, label, unit, current, None, None, before, None, False,
                             lo, hi, f"{label}이(가) 이미 0이라 더 줄일 수 없습니다"))
            continue

        found = _bisect(lo, hi, TOLERANCE[var], prob_at, max_crisis_prob,
                        lower_is_better=lower_is_better)

        if found is None:
            edge = lo if lower_is_better else hi
            out.append(Lever(
                var, label, unit, current, None, None, before, prob_at(edge), False,
                lo, hi,
                f"탐색 범위({_fmt(lo, unit)}~{_fmt(hi, unit)}) 안에서는 목표에 닿지 않습니다"))
            continue

        after = prob_at(found)
        ratio = (found / current - 1.0) if current else None
        out.append(Lever(
            var, label, unit, current, found, ratio, before, after, True,
            lo, hi, _note(label, current, found, unit)))

    return out


def _fmt(v: float, unit: str) -> str:
    if unit == "원":
        return f"{v / 10_000:,.0f}만원"
    return f"{v:,.0f}{unit}"


def _has_batchim(ch: str) -> bool:
    """한글 음절에 받침이 있는가. 조사를 고르는 데 쓴다."""
    if not ("가" <= ch <= "힣"):
        return False
    return (ord(ch) - 0xAC00) % 28 != 0


def _josa(word: str, with_batchim: str, without: str) -> str:
    """'생활비을(를)' 처럼 괄호를 남기지 않는다 — 농가가 읽는 문장이다."""
    return with_batchim if word and _has_batchim(word[-1]) else without


def _note(label: str, frm: float, to: float, unit: str) -> str:
    if abs(to - frm) < 1e-9:
        return f"{label}{_josa(label, '은', '는')} 지금 그대로도 됩니다"
    target = _fmt(to, unit)
    direction = "줄이면" if to < frm else "늘리면"
    pct = abs(to / frm - 1.0) * 100 if frm else 0.0
    change = "감소" if to < frm else "증가"
    return (f"{label}{_josa(label, '을', '를')} {target}{_josa(target, '으로', '로')} "
            f"{direction} 됩니다 ({pct:.0f}% {change})")
