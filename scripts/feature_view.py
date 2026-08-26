#!/usr/bin/env python3
"""
scripts/feature_view.py — 기능 단위 뷰

폴더는 레이어로 자르고(사람이 익숙한 구조), 작업은 기능으로 본다(에이전트 컨텍스트).
두 축이 직교하므로 도구가 기능 뷰를 만들어주면 구조를 비틀 필요가 없다.

    python scripts/feature_view.py --list         # 기능 × 차원 표
    python scripts/feature_view.py cashflow       # 이 기능의 전 차원 파일
    python scripts/feature_view.py cashflow --test  # 이 기능 테스트만 실행

## 선언 (meta/boundaries.yaml)

기능은 폴더일 수도, 여러 앱에 흩어진 파일일 수도 있다. 후자가 오히려 흔하다.

    features:
      - name: cashflow
        label: 월별 현금흐름
        paths:
          core:     ["apps/api/engine/cashflow.py"]
          adapters: ["apps/api/stats/calibrate_cashflow.py"]
          web:      ["apps/web/app/app/revenue/**"]
        tests:      ["apps/api/tests/test_cashflow.py"]

차원 이름(core/adapters/web…)은 자유다 — boundaries 의 파이썬 레이어가 아니어도 된다.
간단한 경우엔 옛 형식(`features: [auth, billing]`)도 그대로 동작한다:
레이어 폴더 아래 같은 이름의 하위 폴더를 찾는다.

## ⚠️ 매칭 0이면 조용히 넘어가지 않는다

선언한 패턴이 아무 파일도 못 찾으면 **실패**한다. "없음"으로 표시하고 넘어가면
도구가 거짓 정보를 주는 것이고, 그건 이 골격이 1번으로 금지한 Silent Failure 다.
(실측 사고: 기능 3개를 선언했는데 경로 관례가 안 맞아 전부 "—(없음)" 으로 표시됐고,
 몇 커밋 동안 아무도 도구가 고장난 줄 몰랐다.)
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOUNDARIES = ROOT / "meta" / "boundaries.yaml"
SKIP = {"__pycache__", ".venv", "node_modules", ".git", ".next", "dist", "build"}
TEST_DIRS = ["tests", "apps/*/tests", "*/tests"]


def load() -> dict:
    if not BOUNDARIES.exists():
        print("❌ meta/boundaries.yaml 없음 — 0단계(경계 선언)를 먼저 한다")
        sys.exit(2)
    import yaml
    return yaml.safe_load(BOUNDARIES.read_text()) or {}


def expand_one(pat: str) -> list[Path]:
    """글롭 하나 → 실제 파일. 디렉토리는 그 안의 소스 파일로 펼친다."""
    out: list[Path] = []
    if True:
        for p in ROOT.glob(pat):
            if any(s in p.parts for s in SKIP):
                continue
            if p.is_dir():
                out += [q for q in p.rglob("*")
                        if q.is_file() and q.suffix in {".py", ".ts", ".tsx", ".js", ".jsx"}
                        and not any(s in q.parts for s in SKIP)]
            elif p.is_file():
                out.append(p)
    return sorted(set(out))


def expand(patterns: list[str]) -> list[Path]:
    out: list[Path] = []
    for pat in patterns:
        out += expand_one(pat)
    return sorted(set(out))


def normalize(features: list, layers: list[str]) -> list[dict]:
    """옛 형식(문자열 목록)과 새 형식(dict) 둘 다 받는다."""
    norm = []
    for f in features:
        if isinstance(f, str):                      # 옛 형식 — 레이어/기능 폴더 관례
            norm.append({"name": f, "label": f,
                         "paths": {l: [f"{l}/{f}/**"] for l in layers},
                         "tests": [f"{d}/**/*{f}*.py" for d in ("tests", "apps/*/tests")],
                         "legacy": True})
        else:
            norm.append({"name": f["name"], "label": f.get("label", f["name"]),
                         "paths": f.get("paths") or {}, "tests": f.get("tests") or [],
                         "legacy": False})
    return norm


def resolve(feat: dict) -> tuple[dict[str, list[Path]], list[Path], list[str]]:
    """(차원별 파일, 테스트 파일, 매칭 0인 패턴 목록)"""
    found: dict[str, list[Path]] = {}
    empty: list[str] = []
    for dim, pats in feat["paths"].items():
        files: list[Path] = []
        for pat in pats:
            hit = expand_one(pat)
            files += hit
            # 패턴 단위로 본다 — 같은 차원의 다른 패턴이 맞아도 낡은 선언은 묻히면 안 된다
            if not hit and not feat["legacy"]:
                empty.append(f"{feat['name']}.paths.{dim}: {pat}")
        found[dim] = sorted(set(files))
    tests: list[Path] = []
    for pat in feat["tests"]:
        hit = expand_one(pat)
        tests += hit
        if not hit and not feat["legacy"]:
            empty.append(f"{feat['name']}.tests: {pat}")
    tests = sorted(set(tests))
    return found, tests, empty


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("feature", nargs="?", help="기능 이름")
    ap.add_argument("--list", action="store_true", help="기능 목록")
    ap.add_argument("--test", action="store_true", help="이 기능 테스트 실행")
    a = ap.parse_args()

    b = load()
    layers = [l["name"] if isinstance(l, dict) else l for l in b.get("layers", [])]
    feats = normalize(b.get("features") or [], layers)
    if not feats:
        print("⚠️  boundaries.yaml 에 features 선언 없음")
        return 0

    # ── 목록 ──
    if a.list or not a.feature:
        dims: list[str] = []
        for f in feats:
            for d in f["paths"]:
                if d not in dims:
                    dims.append(d)
        rows, all_empty = [], []
        for f in feats:
            found, tests, empty = resolve(f)
            all_empty += empty
            rows.append((f, found, tests))

        w = max(len(f["label"]) for f, _, _ in rows) + 2
        print(f"\n{'─'*66}\n  기능 {len(feats)}개")
        print(f"  {'기능':<{w}}" + "".join(f"{d:<11}" for d in dims) + "테스트")
        for f, found, tests in rows:
            cells = "".join(f"{(str(len(found[d])) if found.get(d) else '·'):<11}" for d in dims)
            print(f"  {f['label']:<{w}}{cells}{len(tests)}개")

        if all_empty:
            print(f"\n  ❌ 선언했는데 매칭 0인 패턴 {len(all_empty)}건 — "
                  "선언이 낡았거나 경로가 틀렸다")
            for e in all_empty:
                print(f"     {e}")
            print("\n  (조용히 '없음'으로 넘기지 않는다 — 도구가 거짓 정보를 주면 안 된다)")
            return 1
        print("\n  '·' = 그 차원에 파일 없음 (선언 자체가 없는 경우)")
        return 0

    # ── 단일 기능 ──
    match = [f for f in feats if f["name"] == a.feature or f["label"] == a.feature]
    if not match:
        print(f"❌ '{a.feature}' 는 boundaries.yaml features 에 없다 — 선언부터 추가할 것")
        return 1
    feat = match[0]
    found, tests, empty = resolve(feat)

    if a.test:
        if not tests:
            print(f"❌ '{feat['name']}' 관련 테스트 없음 (선언: {feat['tests'] or '없음'})")
            return 1
        print(f"  {feat['label']} 테스트 {len(tests)}개 실행\n")
        return subprocess.run([sys.executable, "-m", "pytest", *map(str, tests), "-q"],
                              cwd=ROOT).returncode

    print(f"\n{'─'*66}\n  기능: {feat['label']}  ({feat['name']})")
    total = 0
    for dim, files in found.items():
        total += len(files)
        print(f"\n  [{dim}]" + ("" if files else "  — 없음"))
        for p in files:
            print(f"    {p.relative_to(ROOT)}")
    print(f"\n  [테스트]")
    for p in tests:
        print(f"    {p.relative_to(ROOT)}")
    print(f"\n  소스 {total}개 · 테스트 {len(tests)}개")
    if empty:
        print(f"\n  ❌ 매칭 0인 패턴 {len(empty)}건:")
        for e in empty:
            print(f"     {e}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
