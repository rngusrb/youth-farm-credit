#!/usr/bin/env python3
"""
scripts/loop.py — 반복 수렴 루프 (측정 → 체크포인트 → 판정 → 되돌리기 → 정지)

에이전트가 작업하고, 라운드마다 이 도구를 부른다. 이 도구는 **일하지 않는다** —
재고, 저장하고, 판정하고, 나빠졌으면 되돌리고, 언제 멈출지 결정한다.

    python scripts/loop.py start "타입 에러 0으로"    # 기준선 측정 + 시작
    ... 에이전트가 작업 ...
    python scripts/loop.py round                      # 채점 → 판정 → 지시
    ... 지시대로 계속 ...
    python scripts/loop.py stop                       # 요약

판정 결과 (종료 코드):
    0 = CONTINUE   나아졌다. 새 기준선. 계속.
    0 = REVERTED   나빠졌다. 되돌렸다. 다른 방법으로 다시.
    3 = STOP       정체/상한 도달. 사람을 부른다.
    4 = HACK       점수 해킹 감지(테스트가 줄었다). 되돌리고 즉시 정지.

점수는 **사전식**으로 비교한다. 가중합을 쓰지 않는 이유: 가중치에 근거가 없기 때문이다.
meta/project_state.yaml 의 loop.score_order 순서가 곧 우선순위이고,
앞 항목이 같을 때만 뒤 항목을 본다.

⚠️ 되돌릴 수 없는 작업(배포·마이그레이션·외부 호출·파일 삭제)에는 쓰지 않는다.
   이 루프의 안전장치는 전부 "되돌리기"에 기대고 있다.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOOP_DIR = ROOT / ".loop"
STATE = LOOP_DIR / "state.json"
ROUNDS = LOOP_DIR / "rounds.jsonl"
HARNESS = ROOT / "scripts" / "harness.py"

DEFAULTS = {
    # 사전식 우선순위. 전부 작을수록 좋음. 앞에 '-' 를 붙이면 클수록 좋음.
    "score_order": ["failed", "lint_fail", "gc"],
    "max_rounds": 8,          # 라운드 상한 (비용·시간 방어)
    "stall_rounds": 3,        # 연속 무변화 N회면 정지
    "target": "all",
    "metrics": {},            # 이름: 셸 명령 (마지막 줄 숫자를 점수로 읽음)
    "guard_tests": True,      # 테스트 수 감소 = 점수 해킹으로 간주 (collected)
    # 줄어들면 '지워서 점수 올리기'로 보는 지표들. 코드=테스트 수, UI=내용 총량.
    # 점수 해킹의 형태는 도메인마다 다르지만 원리는 같다: **대상을 없애서 점수를 올린다.**
    "guard_no_decrease": [],
}


# ── 설정·git 유틸 ───────────────────────────────────────────────────────────

def cfg() -> dict:
    meta = ROOT / "meta" / "project_state.yaml"
    if not meta.exists():
        return dict(DEFAULTS)
    try:
        import yaml
        loaded = (yaml.safe_load(meta.read_text()) or {}).get("loop") or {}
    except Exception as e:
        print(f"⚠️  meta 파싱 실패, 기본값 사용: {e}")
        loaded = {}
    return {**DEFAULTS, **loaded}


def git(*args: str, check: bool = True) -> str:
    r = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)
    if check and r.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} 실패: {r.stderr.strip()}")
    return r.stdout.strip()


def git_available() -> bool:
    return (ROOT / ".git").exists()


def head() -> str:
    return git("rev-parse", "HEAD") if git_available() else "nogit"


def dirty() -> bool:
    return bool(git("status", "--porcelain", check=False)) if git_available() else False


# ── 채점 ────────────────────────────────────────────────────────────────────

def run_metric(name: str, command: str) -> float | None:
    """커스텀 지표 — 셸 명령의 마지막 숫자 줄을 점수로 읽는다."""
    r = subprocess.run(command, shell=True, cwd=ROOT, capture_output=True, text=True)
    for line in reversed((r.stdout + r.stderr).splitlines()):
        line = line.strip()
        try:
            return float(line)
        except ValueError:
            continue
    print(f"⚠️  지표 '{name}' 이 숫자를 내지 않음 — 이번 라운드 제외")
    return None


def score(c: dict) -> dict:
    r = subprocess.run([sys.executable, str(HARNESS), c["target"], "--json"],
                       cwd=ROOT, capture_output=True, text=True)
    try:
        s = json.loads(r.stdout.strip().splitlines()[-1])
    except (json.JSONDecodeError, IndexError):
        raise RuntimeError(f"harness --json 파싱 실패:\n{r.stdout}\n{r.stderr}")
    for name, command in (c["metrics"] or {}).items():
        v = run_metric(name, command)
        if v is not None:
            s[name] = v
    return s


# ── 사전식 비교 ─────────────────────────────────────────────────────────────

def compare(new: dict, base: dict, order: list[str]) -> tuple[int, str]:
    """(-1 나아짐 / 0 동일 / 1 나빠짐, 근거 문장). 앞 항목이 같을 때만 뒤를 본다."""
    for key in order:
        higher_better = key.startswith("-")
        k = key.lstrip("-")
        if k not in new or k not in base:
            continue
        a, b = new[k], base[k]
        if a == b:
            continue
        better = a > b if higher_better else a < b
        arrow = "↓" if a < b else "↑"
        return (-1 if better else 1,
                f"{k} {b}{arrow}{a} ({'개선' if better else '악화'})")
    return 0, "점수 동일"


# ── 상태 ────────────────────────────────────────────────────────────────────

def load_state() -> dict:
    if not STATE.exists():
        print("❌ 루프가 시작되지 않았다 — 먼저 `loop.py start \"<목표>\"`")
        sys.exit(1)
    return json.loads(STATE.read_text())


def save_state(st: dict) -> None:
    LOOP_DIR.mkdir(exist_ok=True)
    STATE.write_text(json.dumps(st, ensure_ascii=False, indent=2))


def append_round(rec: dict) -> None:
    with ROUNDS.open("a") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def fmt(s: dict, order: list[str]) -> str:
    keys = [k.lstrip("-") for k in order] + ["passed", "collected"]
    return "  ".join(f"{k}={s[k]:g}" for k in dict.fromkeys(keys) if k in s)


# ── 명령 ────────────────────────────────────────────────────────────────────

def cmd_start(goal: str) -> int:
    c = cfg()
    if git_available() and dirty():
        print("❌ 작업 트리가 더럽다 — 커밋하거나 stash 후 시작할 것.\n"
              "   (루프는 라운드마다 커밋/되돌리기를 하므로 깨끗한 상태가 전제다)")
        return 1
    LOOP_DIR.mkdir(exist_ok=True)
    ROUNDS.unlink(missing_ok=True)

    print(f"\n{'='*54}\n  루프 시작: {goal}\n{'='*54}")
    print("  기준선 측정 중...")
    base = score(c)
    st = {"goal": goal, "round": 0, "stall": 0,
          "baseline": base, "initial": base, "baseline_commit": head(),
          "start_commit": head(), "config": c, "history": []}
    save_state(st)
    print(f"  기준선: {fmt(base, c['score_order'])}")
    print(f"\n  우선순위(사전식): {' > '.join(c['score_order'])}")
    print(f"  상한 {c['max_rounds']}라운드 · 연속 무변화 {c['stall_rounds']}회면 정지")
    print(f"\n  이제 작업하고 `python scripts/loop.py round` 를 부른다.\n")
    return 0


def cmd_round() -> int:
    st = load_state()
    c = st["config"]
    order = c["score_order"]
    st["round"] += 1
    n = st["round"]

    print(f"\n{'='*54}\n  라운드 {n} 채점\n{'='*54}")
    new = score(c)
    base = st["baseline"]
    print(f"  기준선: {fmt(base, order)}")
    print(f"  이번:   {fmt(new, order)}")

    # ── 점수 해킹 가드 — 다른 무엇보다 먼저 본다 ──
    guarded = list(c.get("guard_no_decrease") or [])
    if c.get("guard_tests", True):
        guarded.insert(0, "collected")
    dropped = [(k, base[k], new[k]) for k in dict.fromkeys(guarded)
               if k in base and k in new and new[k] < base[k]]
    if dropped:
        k, before, after = dropped[0]
        label = "테스트 수" if k == "collected" else k
        print(f"\n  🚨 점수 해킹 감지 — {label} {before:g} → {after:g}")
        print("     점수를 올리려고 **대상 자체를 지운** 것으로 본다.")
        print("     되돌리고 정지한다. 정당하게 지워야 하면 사람 승인을 받을 것.")
        verdict = "HACK"
        if git_available():
            git("reset", "--hard", st["baseline_commit"])
            print(f"     ↩ {st['baseline_commit'][:8]} 로 되돌림")
        why = f"{label} {before:g}→{after:g} (점수 해킹)"
        rec = {"round": n, "verdict": verdict, "score": new, "why": why,
               "commit": st["baseline_commit"]}
        append_round(rec)
        st["history"].append(rec)
        save_state(st)
        return 4

    direction, why = compare(new, base, order)

    if direction < 0:                                    # 나아짐
        verdict, code = "CONTINUE", 0
        commit = head()
        if git_available() and dirty():
            git("add", "-A")
            git("commit", "-m", f"loop round {n}: {why}")
            commit = head()
        st["baseline"], st["baseline_commit"], st["stall"] = new, commit, 0
        print(f"\n  ✅ 개선 — {why}")
        print(f"     체크포인트 {commit[:8]} · 새 기준선. 계속.")

    elif direction > 0:                                  # 나빠짐
        verdict, code = "REVERTED", 0
        print(f"\n  ❌ 악화 — {why}")
        if git_available():
            git("reset", "--hard", st["baseline_commit"])
            print(f"     ↩ {st['baseline_commit'][:8]} 로 되돌림. 다른 방법으로 다시.")
        else:
            print("     ⚠️ git 없음 — 수동으로 되돌릴 것")
        st["stall"] += 1

    else:                                                # 동일
        verdict, code = "STALL", 0
        st["stall"] += 1
        print(f"\n  ⏸ 변화 없음 ({st['stall']}/{c['stall_rounds']})")
        if git_available() and dirty():
            git("reset", "--hard", st["baseline_commit"])
            print("     ↩ 변경 되돌림 (점수를 못 움직인 변경은 남기지 않는다)")

    rec = {"round": n, "verdict": verdict, "score": new, "why": why,
           "commit": st["baseline_commit"]}
    append_round(rec)
    st["history"].append(rec)

    # ── 정지 조건 ──
    stop_reason = None
    if st["stall"] >= c["stall_rounds"]:
        stop_reason = f"연속 {st['stall']}회 개선 없음 — 접근을 바꿔야 한다"
    elif n >= c["max_rounds"]:
        stop_reason = f"라운드 상한 {c['max_rounds']} 도달"
    elif all(new.get(k.lstrip('-'), 1) == 0 for k in order if not k.startswith("-")):
        stop_reason = "목표 달성 — 모든 점수 0"

    save_state(st)
    if stop_reason:
        print(f"\n  🛑 정지: {stop_reason}")
        print("     `python scripts/loop.py stop` 으로 요약을 본다.")
        return 3
    return code


def cmd_status() -> int:
    st = load_state()
    order = st["config"]["score_order"]
    print(f"\n  목표: {st['goal']}")
    print(f"  라운드 {st['round']} / {st['config']['max_rounds']} · 정체 {st['stall']}")
    print(f"  현재 기준선: {fmt(st['baseline'], order)}")
    for r in st["history"][-5:]:
        print(f"    R{r['round']:<2} {r['verdict']:<9} {r.get('why','')}")
    return 0


def cmd_stop() -> int:
    st = load_state()
    order = st["config"]["score_order"]
    start = st.get("initial") or st["baseline"]
    print(f"\n{'='*54}\n  루프 종료: {st['goal']}\n{'='*54}")
    print(f"  라운드 {st['round']}회")
    print(f"  시작:  {fmt(start, order)}")
    print(f"  최종:  {fmt(st['baseline'], order)}")
    tally: dict[str, int] = {}
    for r in st["history"]:
        tally[r["verdict"]] = tally.get(r["verdict"], 0) + 1
    print(f"  판정 분포: {tally}")
    print(f"  체크포인트: {st['baseline_commit'][:8]}")
    print(f"  기록: .loop/rounds.jsonl\n")
    STATE.unlink(missing_ok=True)
    return 0


def cmd_revert(to: int | None) -> int:
    st = load_state()
    if not git_available():
        print("❌ git 없음")
        return 1
    target = st["baseline_commit"]
    if to is not None:
        match = [r for r in st["history"] if r["round"] == to]
        if not match:
            print(f"❌ 라운드 {to} 기록 없음")
            return 1
        target = match[0]["commit"]
    git("reset", "--hard", target)
    print(f"↩ {target[:8]} 로 되돌림")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="반복 수렴 루프")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("start", help="기준선 측정 + 루프 시작")
    p.add_argument("goal", help="이번 루프의 목표 (한 줄)")
    sub.add_parser("round", help="작업 후 채점 → 판정 → 지시")
    sub.add_parser("status", help="현재 상태")
    sub.add_parser("stop", help="종료 + 요약")
    p = sub.add_parser("revert", help="체크포인트로 되돌림")
    p.add_argument("--to", type=int, default=None, help="특정 라운드로")
    a = ap.parse_args()

    return {"start": lambda: cmd_start(a.goal), "round": cmd_round,
            "status": cmd_status, "stop": cmd_stop,
            "revert": lambda: cmd_revert(a.to)}[a.cmd]()


if __name__ == "__main__":
    sys.exit(main())
