"""llm/advisor.py — 진단·레버·조항을 묶어 처방과 신청서 초안을 쓴다 (adapters).

## 이 파일이 지키는 두 가지

1. **숫자는 도구 결과에서만 온다.** LLM 이 쓴 문장은 `verify_text` 로 엔진 값과
   대조하고, 어긋나면 문장을 뺀다. 초안이라고 느슨하게 두지 않는다 —
   신청서에 들어갈 숫자가 틀리면 제일 크게 다친다.
2. **제도는 조항 인용으로만 말한다.** 코퍼스에서 찾지 못한 요건은 쓰지 않는다.

## 키가 없으면

템플릿으로 같은 골격을 만든다. 문장이 덜 매끄러울 뿐, **숫자와 조항은 동일하다** —
어차피 둘 다 도구가 만든 것이기 때문이다.
"""
from __future__ import annotations

import logging

from .client import complete, get_client
from .verify import verify_text

log = logging.getLogger(__name__)

#: 초안이 제출 서류로 오해되지 않게 고정으로 붙인다. 지우지 말 것.
DISCLAIMER = "본 초안은 참고용이며 제출 서류가 아닙니다. 실제 신청 서식과 요건은 시·군·구에 확인하세요."

_PROMPT = """너는 농업 정책자금 신청을 돕는 상담사다.
아래 **계산 결과와 조항**만 근거로 신청서 초안을 쓴다.

절대 규칙:
- 숫자를 새로 만들지 마라. 아래 값에 있는 숫자만 쓴다.
- 제도 내용은 아래 조항에 있는 것만 쓴다. 없으면 쓰지 않는다.
- 자격이 있다/없다를 판정하지 마라. 요건과 현황만 적는다.

[계산 결과]
{facts}

[근거 조항]
{clauses}

다음 세 단락으로 쓴다. 각 단락 2~3문장.
1) 경영 현황 (작목·면적·소득)
2) 신청 금액과 상환 계획 (한도·상환여력·위험확률)
3) 요건 관련 현황 (조항 번호를 문장 안에 적는다)"""


def _facts_block(diagnosis: dict, levers: dict | None, bench: dict | None) -> str:
    """LLM 에 넘길 값 목록. 여기 없는 숫자는 쓰면 안 된다."""
    lines = [
        f"작목: {diagnosis['input'].get('crop_name', '')}",
        f"재배면적: {diagnosis['input']['pyeong']:,.0f}평",
        f"연간 농업소득: {diagnosis['income']['annual']:,.0f}원",
        f"상환 가용액: {diagnosis['income']['capacity']:,.0f}원",
        f"제도상 한도: {diagnosis['limits']['available']:,.0f}원",
        f"위험기준 권장 차입: {diagnosis['limits']['risk_based']:,.0f}원",
        f"감내 기준 위기확률: {diagnosis['limits']['max_crisis_prob']:.1%}",
    ]
    if levers and levers.get("levers"):
        lines.append(f"목표 금액: {levers['target_principal']:,.0f}원")
        for l in levers["levers"]:
            if l["reachable"]:
                lines.append(f"조정안: {l['note']}")
    if bench and bench.get("comparable"):
        lines.append(f"내 평균 소득: {bench['my_income']:,.0f}원 "
                     f"(전국 평균 {bench['average_income']:,.0f}원의 {bench['ratio']:.0%})")
    return "\n".join(lines)


def _clause_block(citations: list[dict]) -> str:
    if not citations:
        return "(근거 조항 없음 — 제도 내용을 쓰지 마라)"
    return "\n".join(
        f"[{c.get('section', '?')}] {c.get('doc', '')}: {(c.get('text') or '')[:300]}"
        for c in citations[:4]
    )


def _sections(citations: list[dict]) -> list[str]:
    """인용할 조항 번호 — 중복 제거하고 조항처럼 생긴 것만.

    같은 장(Ⅲ)이 여러 번 걸리면 'Ⅲ, Ⅲ, Ⅲ' 이 되고, 연도(2025)가 섞이면 조항이 아닌
    것을 조항이라 부르게 된다. 둘 다 실제로 나왔다 (2026-09-01).
    """
    out: list[str] = []
    for c in citations:
        s = (c.get("section") or "").strip()
        if not s or s.isdigit():          # '2025' 같은 것은 조항 번호가 아니다
            continue
        if s not in out:
            out.append(s)
    return out[:3]


def _template(diagnosis: dict, levers: dict | None, bench: dict | None,
              citations: list[dict]) -> str:
    """키가 없을 때의 골격. 숫자와 조항은 LLM 경로와 동일하다."""
    inp, inc, lim = diagnosis["input"], diagnosis["income"], diagnosis["limits"]
    paras = [
        f"{inp.get('crop_name', '')} {inp['pyeong']:,.0f}평을 경영하고 있으며, "
        f"연간 농업소득은 {inc['annual']:,.0f}원으로 산출됩니다. "
        f"생활비와 기존 부채상환을 제외한 상환 가용액은 {inc['capacity']:,.0f}원입니다.",
        f"제도상 신청 가능 한도는 {lim['available']:,.0f}원이며, 소득 변동을 반영한 "
        f"권장 차입 규모는 {lim['risk_based']:,.0f}원입니다. "
        f"이는 2년 연속 상환 부족 확률을 {lim['max_crisis_prob']:.1%} 이하로 두는 금액입니다.",
    ]
    if levers and any(l["reachable"] for l in levers.get("levers", [])):
        opts = " ".join(l["note"] for l in levers["levers"] if l["reachable"])
        paras.append(f"목표 금액 {levers['target_principal']:,.0f}원을 감당하려면 다음 조정이 필요합니다. {opts}")
    secs = _sections(citations)
    if secs:
        paras.append(f"관련 요건은 {', '.join(secs)} 조항에 규정되어 있으며, 원문을 함께 첨부합니다.")
    return "\n\n".join(paras)


def draft(diagnosis: dict, levers: dict | None = None, bench: dict | None = None,
          citations: list[dict] | None = None) -> dict:
    """신청서 초안. (본문, 제거된 문장, 방법)

    LLM 이 쓰든 템플릿이 쓰든 **검증은 똑같이 통과해야 한다.**
    """
    citations = citations or []
    client = get_client()
    method = "llm"
    text = ""

    if client is not None:
        text = complete(
            _PROMPT.format(facts=_facts_block(diagnosis, levers, bench),
                           clauses=_clause_block(citations)),
            max_tokens=1600, purpose="신청서 초안", client=client,
        )

    if not text.strip():
        text, method = _template(diagnosis, levers, bench, citations), "template"

    # 허용 수치는 **쓴 도구 전부**에서 모은다. diagnosis 만 넣으면 레버 값(solve_for)이
    # 통째로 걸러진다 — 실제로 그렇게 됐다 (2026-09-01).
    allowed_from = {"diagnose": diagnosis, "levers": levers, "benchmark": bench}
    kept, dropped, used = verify_text(text, allowed_from)
    return {
        "body": kept,
        "dropped": dropped,
        "numbers_used": used,
        "method": method,
        "citations": [c for c in citations
                      if (c.get("section") or "").strip()
                      and not (c.get("section") or "").strip().isdigit()][:4],
        "disclaimer": DISCLAIMER,
    }
