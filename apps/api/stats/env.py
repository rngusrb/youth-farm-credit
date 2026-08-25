"""`.env` 로더.

인증키는 환경변수로만 다룬다. 이 모듈은 apps/api/.env 를 읽어 아직 설정되지 않은
변수만 채운다 — 이미 export 된 값은 덮어쓰지 않는다.
"""
from __future__ import annotations

import os
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"


def load(path: Path = ENV_PATH) -> list[str]:
    """설정된 변수명 목록을 돌려준다. 값은 반환하지 않는다."""
    if not path.exists():
        return []
    loaded: list[str] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip().strip("'\"")
        if key and value and not os.getenv(key):
            os.environ[key] = value
            loaded.append(key)
    return loaded
