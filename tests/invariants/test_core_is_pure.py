"""
tests/invariants/test_core_is_pure.py — core 레이어 순수성 불변식 (작성 예시)

**불변식**: core 는 인터넷·DB·환경변수 없이 전부 돌아야 한다.
이게 깨지면 "레이어를 나눴다"는 말이 거짓이 된다. 문서가 아니라 이 파일이 그걸 판별한다.

⚠️ 이건 **실검출** 불변식이다 (회귀 가드가 아님) — 실제로 실패할 수 있고,
   실패하면 경계가 이미 무너진 것이다.
"""
import ast
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]

#: core 가 어디인지는 **경계 선언이 유일한 출처**다. 여기 경로를 박지 않는다.
#:
#: 사고 이력 2026-09-02: 이 파일은 킷 템플릿 그대로 `ROOT/core` 를 보고 있었다.
#: 이 저장소의 core 는 `apps/api/engine`·`apps/api/estimators` 다(모노레포).
#: 그래서 `core/ 없음` 으로 **항상 skip** 됐다 — 제1원칙의 기계적 증거라고 부르던
#: 파일이 한 번도 아무것도 검사하지 않았다. 게다가 `meta/project_state.yaml` 의
#: `always_run: []` 이 기본값을 덮고 있어 **실행조차 되지 않았다.**
#: 적대적 리뷰 두 번도 이걸 못 봤다 — 한 리뷰어는 "always_run 이 잡는다" 고 적었다.
def core_dirs() -> list[Path]:
    import yaml

    b = yaml.safe_load((ROOT / "meta" / "boundaries.yaml").read_text())
    for layer in b.get("layers") or []:
        if layer.get("name") == "core":
            return [ROOT / p for p in (layer.get("path") or [])]
    return []

NETWORK_MODULES = {"requests", "httpx", "urllib", "aiohttp", "socket", "openai", "anthropic"}
DB_MODULES = {"sqlalchemy", "psycopg2", "asyncpg", "pymongo", "redis", "sqlite3"}
ENV_CALLS = {"getenv", "environ"}


def core_files() -> list[Path]:
    dirs = [d for d in core_dirs() if d.is_dir()]
    assert dirs, (
        "meta/boundaries.yaml 의 core 레이어 경로가 실제로 없다. "
        "예전엔 여기서 skip 했는데, **검사 대상이 없다는 것 자체가 실패다** — "
        "그렇게 이 파일이 몇 달간 조용히 통과했다 (2026-09-02).")
    out = [p for d in dirs for p in d.rglob("*.py") if "__pycache__" not in p.parts]
    assert out, f"core 에 검사할 .py 가 없다: {dirs}"
    return out


def imports_of(py: Path) -> set[str]:
    tree = ast.parse(py.read_text(encoding="utf-8", errors="ignore"))
    out: set[str] = set()
    for n in ast.walk(tree):
        if isinstance(n, ast.Import):
            out |= {a.name.split(".")[0] for a in n.names}
        elif isinstance(n, ast.ImportFrom) and n.module and not n.level:
            out.add(n.module.split(".")[0])
    return out


def test_core_has_no_network():
    bad = {str(p.relative_to(ROOT)): sorted(imports_of(p) & NETWORK_MODULES)
           for p in core_files() if imports_of(p) & NETWORK_MODULES}
    assert not bad, f"core 가 네트워크를 직접 부른다 — adapters 로 옮길 것: {bad}"


def test_core_has_no_db():
    bad = {str(p.relative_to(ROOT)): sorted(imports_of(p) & DB_MODULES)
           for p in core_files() if imports_of(p) & DB_MODULES}
    assert not bad, f"core 가 DB 를 직접 부른다 — adapters 로 옮길 것: {bad}"


def test_core_does_not_read_env():
    bad = []
    for py in core_files():
        src = py.read_text(encoding="utf-8", errors="ignore")
        if any(call in src for call in ENV_CALLS):
            bad.append(str(py.relative_to(ROOT)))
    assert not bad, f"core 가 환경변수를 직접 읽는다 — 설정을 주입할 것: {bad}"
