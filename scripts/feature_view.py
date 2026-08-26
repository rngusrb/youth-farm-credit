#!/usr/bin/env python3
"""
scripts/feature_view.py — 기능 단위 뷰

폴더는 레이어로 자르고(사람이 익숙한 구조), 작업은 기능으로 본다(에이전트 컨텍스트).
두 축이 직교하므로 도구가 기능 뷰를 만들어주면 구조를 비틀 필요가 없다.

    python scripts/feature_view.py billing            # 이 기능의 전 레이어 파일
    python scripts/feature_view.py billing --test     # 이 기능 테스트만 실행
    python scripts/feature_view.py --list             # 기능 목록 + 레이어별 존재 여부

레이어형 구조의 유일한 단점("한 기능 고치는데 3곳을 열어야 함")을 여기서 해소한다.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOUNDARIES = ROOT / "meta" / "boundaries.yaml"
SKIP = {"__pycache__", ".venv", "node_modules", ".git"}


def load() -> dict:
    if not BOUNDARIES.exists():
        print("❌ meta/boundaries.yaml 없음 — 0단계(경계 선언)를 먼저 한다")
        sys.exit(2)
    import yaml
    return yaml.safe_load(BOUNDARIES.read_text()) or {}


def files_of(feature: str, layers: list[str]) -> dict[str, list[Path]]:
    out: dict[str, list[Path]] = {}
    for layer in layers:
        d = ROOT / layer / feature
        if d.is_dir():
            out[layer] = sorted(p for p in d.rglob("*.py")
                                if not any(s in p.parts for s in SKIP))
    return out


def tests_of(feature: str) -> list[Path]:
    """tests/ 아래에서 기능 이름이 들어간 파일 전부 (계층 무관)."""
    t = ROOT / "tests"
    if not t.is_dir():
        return []
    return sorted(p for p in t.rglob(f"*{feature}*.py")
                  if not any(s in p.parts for s in SKIP))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("feature", nargs="?", help="기능 이름 (예: billing)")
    ap.add_argument("--list", action="store_true", help="기능 목록")
    ap.add_argument("--test", action="store_true", help="이 기능 테스트 실행")
    a = ap.parse_args()

    b = load()
    layers = [l["name"] for l in b.get("layers", [])]
    features = b.get("features") or []

    if a.list or not a.feature:
        print(f"\n  기능 {len(features)}개  (레이어: {' → '.join(layers)})\n")
        print(f"  {'기능':<14}" + "".join(f"{l:<12}" for l in layers) + "테스트")
        for f in features:
            found = files_of(f, layers)
            marks = "".join(f"{('✅ ' + str(len(found[l]))) if l in found else '—':<12}"
                            for l in layers)
            print(f"  {f:<14}{marks}{len(tests_of(f))}개")
        print("\n  '—' = 그 레이어에 이 기능 폴더가 없음 (의도된 것인지 확인)")
        return 0

    feature = a.feature
    if feature not in features:
        print(f"⚠️  '{feature}' 는 boundaries.yaml features 에 없다 — 선언부터 추가할 것")

    found = files_of(feature, layers)
    tests = tests_of(feature)

    if a.test:
        if not tests:
            print(f"❌ '{feature}' 관련 테스트 없음")
            return 1
        print(f"  {feature} 테스트 {len(tests)}개 실행\n")
        r = subprocess.run([sys.executable, "-m", "pytest", *map(str, tests), "-q"],
                           cwd=ROOT)
        return r.returncode

    print(f"\n{'─'*54}\n  기능: {feature}")
    total = 0
    for layer in layers:
        paths = found.get(layer, [])
        total += len(paths)
        print(f"\n  [{layer}]" + ("" if paths else "  — 없음"))
        for p in paths:
            print(f"    {p.relative_to(ROOT)}")
    print(f"\n  [테스트]")
    for p in tests:
        print(f"    {p.relative_to(ROOT)}")
    print(f"\n  소스 {total}개 · 테스트 {len(tests)}개")
    print(f"  실행: python scripts/feature_view.py {feature} --test")
    return 0


if __name__ == "__main__":
    sys.exit(main())
