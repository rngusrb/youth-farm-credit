"""engine/tools.py — 계산 엔진을 **도구**로 노출한다.

## 왜 이렇게 하나

에이전트가 도구를 고르는 구조로 가면, 제1원칙("숫자는 LLM 이 생성하지 않는다")이
지키려고 애쓰는 규칙이 아니라 **구조의 필연적 결과**가 된다 —
LLM 은 도구 이름과 인자를 고를 뿐이고, 숫자는 전부 여기 있는 결정론 코드가 만든다.

## 여기 없는 것

프롬프트가 없다. 외부 호출도 없다. **어떤 도구를 부를지 고르는 일도 여기서 하지 않는다**
(그건 adapters/llm 의 일이다). 이 모듈은 *무엇을 부를 수 있는지 선언하고, 부르면 실행한다*.

## refs — Verifier 가 대조할 좌표

각 도구는 `returns` 에 "이 도구가 만든 수치가 결과 dict 어디에 있는지"를 점 경로로 선언한다.
설명 문장은 자기가 쓴 수치의 좌표(`refs`)를 달아야 하고, Verifier 가 그 좌표의 실제 값과
문장 속 숫자를 대조한다. **좌표 없는 수치 문장은 통과할 수 없다.**
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from .cashflow import cashflow_for
from .diagnose import DiagnoseInput, diagnose
from .levers import solve_for
from .params import get_crop as _get_crop
from .stress import stress_for


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
