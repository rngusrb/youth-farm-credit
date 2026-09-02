"""engine/tools.py — 계산 엔진을 **도구**로 노출한다.

## 왜 이렇게 하나

에이전트가 도구를 고르는 구조로 가면, 제1원칙("숫자는 LLM 이 생성하지 않는다")이
지키려고 애쓰는 규칙이 아니라 **구조의 필연적 결과**가 된다 —
LLM 은 도구 이름과 인자를 고를 뿐이고, 숫자는 전부 여기 있는 결정론 코드가 만든다.

## 여기 없는 것

프롬프트가 없다. 외부 호출도 없다. **어떤 도구를 부를지 고르는 일도 여기서 하지 않는다**
(그건 adapters/llm 의 일이다). 이 모듈은 *무엇을 부를 수 있는지 선언하고, 부르면 실행한다*.

## returns — 도구가 무엇을 내는지의 선언

각 도구는 `returns` 에 "이 도구가 만든 수치가 결과 dict 어디에 있는지"를 점 경로로 선언한다.
`test_tools.py` 가 이 좌표를 **실제 출력과 대조**해, 선언과 구현이 어긋나면 실패한다.
(그 검사가 실제로 잘못된 좌표를 잡는 것을 확인했다 — `income.expected` 오타를 잡았다.)

### ⚠️ Verifier 는 이 좌표를 쓰지 않는다 — 실제 검증 강도는 이렇다

한때 이 자리에 **"좌표 없는 수치 문장은 통과할 수 없다"** 고 적혀 있었다. **사실이 아니었다.**
`known_refs()`·`pick()` 은 정의만 있고 **부르는 곳이 없다**(테스트 제외).
실제 `llm/verify.py` 는 좌표를 안 보고, 결과 dict 의 **모든 수치 리프**를 모아
단위 변형(÷1e4, ÷1e8, ×100, 반올림)까지 허용 집합에 넣은 뒤 ±0.5% 로 대조한다.

그래서 이 검증기가 실제로 하는 일은 **"지어낸 큰 금액을 잡는 거친 체"** 다.
작은 수치("5년차", "20%", "1.8배")는 사실상 전부 통과한다. 실측:

    cd apps/api && python3 -c "
    from engine.tools import ENGINE_TOOLS
    from llm.verify import allowed_forms, collect_numbers, _matches
    B={'crop_id':'strawberry_hydro','pyeong':1300.0,'living_cost':30_000_000.0}
    r={'diagnose':ENGINE_TOOLS['diagnose'].fn(**B),
       'funding_map':ENGINE_TOOLS['funding_map'].fn(**B,principal=200_000_000.0)}
    f=allowed_forms(collect_numbers(r))
    print(sum(1 for n in range(1,101) if _matches(float(n),f)), '/100')"
    # → 65/100

**이 문구를 약하게 적는 것이 이 파일의 목적이다.** 이 저장소가 가장 경계하는 상황은
"감사 장치가 사라진 것을 감사 대상이 모르는" 것이고(CLAUDE.md), 주석이 실제보다 강한
보장을 주장하면 정확히 그 상태가 된다. 좌표 대조를 진짜로 배선하기 전까지는
제1원칙의 기계적 증거는 `core: []`(deps_check) 쪽이 본체이고, Verifier 는 보조다.
(적대적 리뷰 H2, 2026-09-02)
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from .benchmark import benchmark
from .cashflow import cashflow_for
from .diagnose import DiagnoseInput, diagnose
from .fundingmap import funding_map
from .levers import solve_for
from .params import get_crop as _get_crop
from .stress import stress_for
from .switch import switch_candidates


@dataclass(frozen=True)
class ToolSpec:
    """도구 하나의 계약. LLM 은 이 선언만 보고 고른다."""

    name: str
    summary: str                      # LLM 이 읽는 한 줄
    required: tuple[str, ...]         # 없으면 되묻기 대상
    optional: tuple[str, ...] = ()
    returns: tuple[str, ...] = ()     # Verifier 가 대조할 수치 좌표
    fn: Callable[..., Any] | None = None

    def missing(self, args: dict) -> tuple[str, ...]:
        return tuple(k for k in self.required if args.get(k) in (None, ""))


def _diag_input(args: dict) -> DiagnoseInput:
    return DiagnoseInput(
        crop_id=args["crop_id"],
        pyeong=float(args["pyeong"]),
        living_cost=float(args["living_cost"]),
        other_debt_service=float(args.get("other_debt_service") or 0.0),
        requested_principal=(None if args.get("requested_principal") in (None, "")
                             else float(args["requested_principal"])),
        income_history=tuple(args.get("income_history") or ()),
    )


# ── 도구 구현 (얇은 어댑터 — 계산은 각 엔진 모듈이 한다) ────────────────────

def _t_get_crop(crop_id: str) -> dict:
    c = _get_crop(crop_id)
    gross, cost = c.gross_per_10a, c.cost_per_10a
    return {"crop_id": c.id, "name": c.name, "sigma": c.sigma,
            "income_per_10a": c.income_per_10a,
            "gross_per_10a": gross, "cost_per_10a": cost,
            "cost_ratio": (cost / gross) if (gross and cost) else None,
            "harvest_months": list(c.harvest_months or []),
            "harvest_known": bool(c.harvest_months)}


def _t_diagnose(**args) -> dict:
    return diagnose(_diag_input(args))


def _t_cashflow(**args) -> dict:
    principal = args.get("principal")
    return cashflow_for(_diag_input(args), float(principal) if principal else 0.0,
                        int(args.get("year") or 1))


def _t_stress(**args) -> dict:
    principal = args.get("principal")
    return stress_for(_diag_input(args), float(principal) if principal else None)


def _t_switch(**args) -> dict:
    """작목 전환 후보. 전환 비용을 반영하지 못한다는 사실이 결과에 실려 나간다."""
    return switch_candidates(str(args["crop_id"]), float(args["pyeong"]),
                             int(args.get("top_n") or 5))


def _t_funding_map(**args) -> dict:
    inp = _diag_input(args)
    principal = args.get("principal")
    if not principal:
        principal = diagnose(inp)["limits"]["risk_based"]
    return funding_map(inp, float(principal))


def _t_benchmark(**args) -> dict:
    return benchmark(str(args["crop_id"]), float(args["pyeong"]),
                     tuple(args.get("actual_income") or args.get("income_history") or ()))


def _t_solve_for(**args) -> dict:
    inp = _diag_input(args)
    movables = tuple(args.get("movables") or ("living_cost", "other_debt_service", "pyeong"))
    levers = solve_for(inp, float(args["target_principal"]), movables=movables)
    return {"target_principal": float(args["target_principal"]),
            "levers": [vars(l) for l in levers]}


ENGINE_TOOLS: dict[str, ToolSpec] = {
    t.name: t for t in (
        ToolSpec(
            name="get_crop",
            summary="작목의 평균 소득·경영비율·소득 변동성(σ)·출하월을 조회한다",
            required=("crop_id",),
            returns=("sigma", "income_per_10a", "gross_per_10a", "cost_per_10a", "cost_ratio"),
            fn=_t_get_crop,
        ),
        ToolSpec(
            name="diagnose",
            summary="상환여력과 차입 한도 3종(제도상·DSCR·상환위험)과 위험확률을 계산한다",
            required=("crop_id", "pyeong", "living_cost"),
            optional=("other_debt_service", "requested_principal", "income_history"),
            returns=("limits.risk_based", "limits.available", "limits.recommended",
                     "limits.gap", "limits.unsafe_gap", "limits.max_crisis_prob",
                     "income.annual", "income.capacity",
                     "min_area_pyeong", "target_dscr", "sigma"),
            fn=_t_diagnose,
        ),
        ToolSpec(
            name="cashflow",
            summary="작목 출하월을 반영해 월별 현금흐름과 자금이 마르는 달을 계산한다",
            required=("crop_id", "pyeong", "living_cost"),
            optional=("principal", "other_debt_service", "year"),
            returns=("trough_month", "trough_balance", "working_capital_need",
                     "annual_net", "annual.gross", "annual.operating_cost",
                     "annual.income", "annual.debt_payment"),
            fn=_t_cashflow,
        ),
        ToolSpec(
            name="stress",
            summary="가격 하락·생산량 감소·금리 상승·재해 시나리오별로 다시 계산한다",
            required=("crop_id", "pyeong", "living_cost"),
            optional=("other_debt_service", "principal"),
            returns=("principal", "tolerance", "sigma", "leverage"),
            fn=_t_stress,
        ),
        ToolSpec(
            name="solve_for",
            summary=("원하는 차입 금액을 감당하려면 생활비·기존부채·면적이 각각 "
                     "얼마나 달라져야 하는지 역으로 찾는다"),
            required=("crop_id", "pyeong", "living_cost", "target_principal"),
            optional=("other_debt_service", "movables"),
            returns=("target_principal",),
            fn=_t_solve_for,
        ),
        ToolSpec(
            name="switch_crop",
            summary=("같은 면적으로 다른 작목을 하면 소득·변동성이 어떻게 되는지, "
                     "두 작목을 절반씩 섞으면 얼마나 안정되는지 계산한다. "
                     "전환 비용은 반영하지 못한다"),
            required=("crop_id", "pyeong"),
            optional=("top_n",),
            returns=("current.income", "current.sigma"),
            fn=_t_switch,
        ),
        ToolSpec(
            name="funding_map",
            summary=("거치 종료·원금 상환 시작·상환여력 초과·부족확률 초과가 "
                     "각각 몇 년차인지 연도별로 계산한다"),
            required=("crop_id", "pyeong", "living_cost"),
            optional=("other_debt_service", "principal", "income_history"),
            returns=("principal", "grace_years", "term_years"),
            fn=_t_funding_map,
        ),
        ToolSpec(
            name="benchmark",
            summary="전국 같은 작목 평균과 견줘 내 소득이 어디쯤인지 계산한다",
            required=("crop_id", "pyeong"),
            optional=("actual_income", "income_history"),
            returns=("crop_traits.sigma", "crop_traits.sigma_rank",
                     "crop_traits.sigma_total"),
            fn=_t_benchmark,
        ),
    )
}


# ── refs 대조 (Verifier 의 core 쪽 절반) ───────────────────────────────────

def pick(result: Any, path: str) -> Any:
    """'limits.risk_based' 같은 점 경로로 값을 꺼낸다. 없으면 KeyError."""
    cur = result
    for part in path.split("."):
        if isinstance(cur, dict):
            if part not in cur:
                raise KeyError(path)
            cur = cur[part]
        elif isinstance(cur, (list, tuple)) and part.isdigit():
            cur = cur[int(part)]
        else:
            raise KeyError(path)
    return cur


def known_refs(tool_name: str) -> tuple[str, ...]:
    spec = ENGINE_TOOLS.get(tool_name)
    return spec.returns if spec else ()