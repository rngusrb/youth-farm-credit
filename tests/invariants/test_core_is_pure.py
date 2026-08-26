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
CORE = ROOT / "core"

NETWORK_MODULES = {"requests", "httpx", "urllib", "aiohttp", "socket", "openai", "anthropic"}
DB_MODULES = {"sqlalchemy", "psycopg2", "asyncpg", "pymongo", "redis", "sqlite3"}
ENV_CALLS = {"getenv", "environ"}


def core_files() -> list[Path]:
    if not CORE.is_dir():
        pytest.skip("core/ 없음")
    return [p for p in CORE.rglob("*.py") if "__pycache__" not in p.parts]


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
