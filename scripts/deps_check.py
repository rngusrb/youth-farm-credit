#!/usr/bin/env python3
"""
scripts/deps_check.py — 경계 강제 (의존 방향 + 금지 심볼)

meta/boundaries.yaml 의 선언을 읽어 실제 코드를 검사한다.
**경계를 문서에 쓰는 것만으론 안 지켜진다.** 이 파일이 그 문장을 집행으로 바꾼다.

    python scripts/deps_check.py            # 위반 목록 + 종료코드
    python scripts/deps_check.py --count    # 위반 수만 (loop.py metrics 용)
    python scripts/deps_check.py --graph    # 실제 의존 관계 출력 (선언과 대조)

검사 3종:
  1. 역방향 import   — allowed_imports 에 없는 레이어 간 import
  2. 금지 심볼       — forbidden_symbols (core 에 프롬프트, api 에 SQL 등)
  3. shared 비대     — 입장 조건 없이 자라는 공용 폴더
"""
from __future__ import annotations

import argparse
import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOUNDARIES = ROOT / "meta" / "boundaries.yaml"
SKIP = {"__pycache__", ".venv", "venv", "node_modules", ".git", "tests", "build", "dist"}


def load_boundaries() -> dict:
    if not BOUNDARIES.exists():
        print(f"❌ {BOUNDARIES.relative_to(ROOT)} 없음 — 0단계(경계 선언)를 먼저 한다")
        sys.exit(2)
    try:
        import yaml
    except ImportError:
        print("❌ pyyaml 필요: pip install pyyaml")
        sys.exit(2)
    return yaml.safe_load(BOUNDARIES.read_text()) or {}


def layer_paths(spec: dict) -> dict[str, list[str]]:
    """레이어 → 실제 경로 목록.

    기본은 '레이어 이름 = 루트 폴더 이름'이다. 다만 모노레포처럼 코드가 중첩돼
    있으면 그 가정이 깨지므로, boundaries.yaml 의 layers[].path 로 실제 경로를
    선언할 수 있게 한다. 코드를 도구에 맞춰 옮기는 것보다 도구가 코드를 가리키는
    편이 맞다.
    """
    out: dict[str, list[str]] = {}
    for entry in spec.get("layers", []):
        name = entry["name"] if isinstance(entry, dict) else entry
        raw = entry.get("path", name) if isinstance(entry, dict) else name
        out[name] = [raw] if isinstance(raw, str) else list(raw)
    return out


def layer_of(path: Path, layers: list[str], paths: dict[str, list[str]] | None = None) -> str | None:
    """파일이 속한 레이어. 가장 긴 경로가 먼저 매치되게 해 중첩을 올바로 가른다."""
    try:
        rel = path.relative_to(ROOT).as_posix()
    except ValueError:
        return None
    if paths:
        for name, prefixes in sorted(
            paths.items(), key=lambda kv: -max(len(p) for p in kv[1])
        ):
            for prefix in prefixes:
                if rel == prefix or rel.startswith(prefix.rstrip("/") + "/"):
                    return name
        return None
    top = rel.split("/")[0]
    return top if top in layers else None


def imported_modules(py: Path) -> list[tuple[str, int]]:
    """(모듈 최상위 이름, 줄번호) 목록. 문법 오류 파일은 건너뛴다."""
    try:
        tree = ast.parse(py.read_text(encoding="utf-8", errors="ignore"))
    except SyntaxError:
        return []
    out: list[tuple[str, int]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            out += [(a.name.split(".")[0], node.lineno) for a in node.names]
        elif isinstance(node, ast.ImportFrom):
            if node.level:                      # 상대 import 는 같은 레이어 안이므로 통과
                continue
            if node.module:
                out.append((node.module.split(".")[0], node.lineno))
    return out


def source_files_for(paths: list[str]) -> list[Path]:
    """선언된 경로들의 .py 를 모은다 (중첩 레이아웃 지원)."""
    out: list[Path] = []
    for prefix in paths:
        d = ROOT / prefix
        if d.is_dir():
            out += [p for p in d.rglob("*.py") if not any(s in p.parts for s in SKIP)]
        elif d.suffix == ".py" and d.exists():
            out.append(d)
    return out


def module_map(spec: dict) -> dict[str, str]:
    """import 최상위 모듈명 → 레이어. 폴더명과 레이어명이 다를 때 필요하다."""
    out: dict[str, str] = {}
    for entry in spec.get("layers", []):
        if not isinstance(entry, dict):
            out[entry] = entry
            continue
        mods = entry.get("modules")
        if mods is None:
            out[entry["name"]] = entry["name"]
        else:
            for m in ([mods] if isinstance(mods, str) else mods):
                out[m] = entry["name"]
    return out


def source_files(layer: str) -> list[Path]:
    d = ROOT / layer
    if not d.is_dir():
        return []
    return [p for p in d.rglob("*.py") if not any(s in p.parts for s in SKIP)]


def check(b: dict) -> list[dict]:
    layers = [l["name"] for l in b.get("layers", [])]
    paths = layer_paths(b)
    mods_to_layer = module_map(b)
    allowed = b.get("allowed_imports", {}) or {}
    findings: list[dict] = []

    # ── 1. 의존 방향 ──
    for layer in layers:
        ok = set(allowed.get(layer) or []) | {layer}
        for py in source_files_for(paths.get(layer, [layer])):
            for raw, line in imported_modules(py):
                mod = mods_to_layer.get(raw)
                if mod and mod not in ok:
                    findings.append({
                        "type": "forbidden_import",
                        "where": f"{py.relative_to(ROOT)}:{line}",
                        "message": f"{layer} → {mod} 금지 "
                                   f"(허용: {', '.join(sorted(ok - {layer})) or '없음'})",
                    })

    # ── 2. 금지 심볼 ──
    for layer, rules in (b.get("forbidden_symbols") or {}).items():
        for rule in rules:
            try:
                rx = re.compile(rule["pattern"])
            except re.error as e:
                findings.append({"type": "bad_pattern", "where": "boundaries.yaml",
                                 "message": f"{rule['pattern']!r} 정규식 오류: {e}"})
                continue
            for py in source_files(layer):
                content = py.read_text(encoding="utf-8", errors="ignore")
                for m in rx.finditer(content):
                    findings.append({
                        "type": "forbidden_symbol",
                        "where": f"{py.relative_to(ROOT)}:{content.count(chr(10), 0, m.start()) + 1}",
                        "message": rule["message"],
                    })

    # ── 3. shared 비대 ──
    sh = b.get("shared") or {}
    if sh.get("path"):
        d = ROOT / sh["path"]
        if d.is_dir():
            n = len([p for p in d.rglob("*.py") if not any(s in p.parts for s in SKIP)])
            if n > int(sh.get("max_files", 20)):
                findings.append({
                    "type": "shared_bloat", "where": sh["path"],
                    "message": f"파일 {n}개 > 상한 {sh['max_files']} — "
                               f"쓰레기통이 되고 있다. 입장 조건: {sh.get('rule','(미선언)')}",
                })
    return findings


def print_graph(b: dict) -> None:
    """선언 vs 실제. 선언에 없는 의존이 있으면 그게 곧 위반이다."""
    layers = [l["name"] for l in b.get("layers", [])]
    print("\n  선언된 방향:")
    for layer in layers:
        allowed = (b.get("allowed_imports") or {}).get(layer) or []
        print(f"    {layer:<10} → {', '.join(allowed) or '(없음)'}")
    paths = layer_paths(b)
    mods_to_layer = module_map(b)
    print("\n  실제 의존:")
    for layer in layers:
        actual: dict[str, int] = {}
        for py in source_files_for(paths.get(layer, [layer])):
            for raw, _ in imported_modules(py):
                mod = mods_to_layer.get(raw)
                if mod and mod != layer:
                    actual[mod] = actual.get(mod, 0) + 1
        detail = ", ".join(f"{k}({v}회)" for k, v in sorted(actual.items())) or "(없음)"
        print(f"    {layer:<10} → {detail}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", action="store_true", help="위반 수만 출력 (loop metrics 용)")
    ap.add_argument("--graph", action="store_true", help="선언 vs 실제 의존 관계")
    a = ap.parse_args()

    b = load_boundaries()
    if a.graph:
        print_graph(b)
        return 0

    findings = check(b)
    if a.count:
        print(len(findings))
        return 0

    print(f"\n{'─'*54}\n  경계 검사")
    if not findings:
        layers = [l["name"] for l in b.get("layers", [])]
        print(f"  ✅ 위반 없음 (레이어 {len(layers)}개: {' → '.join(layers)})")
        return 0
    for f in findings:
        print(f"  ❌ [{f['type']}] {f['where']}\n     {f['message']}")
    print(f"\n  위반 {len(findings)}건")
    return 1


if __name__ == "__main__":
    sys.exit(main())
