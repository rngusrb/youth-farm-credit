"""테스트가 실제 LLM 을 때리지 않는다 — 이 성질을 검사로 못박는다.

## 왜 있나

2026-09-02 전체 테스트가 실행마다 실제 LLM 을 **9회** 호출하고 있었다.
아무도 몰랐던 이유는 하나다 — **아무 검사도 이걸 보고 있지 않았다.**

세 가지가 동시에 나빠진다.
- 돈: 하네스를 돌릴 때마다 요금이 나간다
- 결정론: 키를 켜고 끄면 결과가 갈린다 (실제로 test_prescribe 가 그렇게 깨졌다)
- 속도: 65초 중 35초가 네트워크 대기였다

계약 테스트는 **공짜이고 결정론이어야 한다.** 품질·확률 경로는 별도 eval 로 간다.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

API = Path(__file__).resolve().parents[1]

_PROBE = """
import json, os
from collections import Counter

import pytest

CALLS = Counter()


#: 요금이 나가는 진입점을 **전부** 막는다.
#: 2026-09-02 `create` 만 감시했더니 `messages.parse` 를 쓰는 슬롯 추출이 통째로
#: 안 보였다. 검사가 0건이라 보고하는 동안 추출 테스트는 실제 LLM 을 타고 있었고,
#: 모델이 다른 작목을 고른 날 하네스가 흔들렸다. **감시 목록을 좁게 잡으면
#: 검사가 눈이 먼 채로 통과한다.**
PAID_METHODS = ("create", "parse", "stream")


@pytest.fixture(autouse=True)
def _count_llm(monkeypatch, request):
    import anthropic.resources.messages as M

    for name in PAID_METHODS:
        if not hasattr(M.Messages, name):
            continue

        def spy(self, *a, _n=name, **k):
            CALLS[f"{request.node.nodeid} [{_n}]"] += 1
            raise RuntimeError("유료 호출 차단")   # 실제로 돈이 나가진 않게 막는다

        monkeypatch.setattr(M.Messages, name, spy)


def pytest_sessionfinish(session, exitstatus):
    # sessionfinish 의 print 는 pytest 가 삼킨다 (2026-09-02 그렇게 한 번 놓쳤다).
    # 파일로 남긴다.
    Path = __import__("pathlib").Path
    Path(os.environ["PAID_CALL_REPORT"]).write_text(json.dumps(dict(CALLS), ensure_ascii=False))
"""


def test_suite_makes_no_real_llm_calls(tmp_path):
    """`anthropic.Messages.create` 를 실제로 부르는 테스트가 없어야 한다.

    자기 자신은 제외한다 (재귀 방지).
    """
    probe = API / "tests" / "_paid_probe.py"
    report = tmp_path / "paid.json"
    probe.write_text(_PROBE)
    try:
        subprocess.run(
            [sys.executable, "-m", "pytest", "tests/", "-q", "-p", "tests._paid_probe",
             "--deselect", "tests/test_no_paid_calls.py"],
            cwd=API, capture_output=True, text=True, timeout=900,
            env={**os.environ, "PAID_CALL_REPORT": str(report)},
        )
    finally:
        probe.unlink(missing_ok=True)

    assert report.exists(), "프로브가 결과를 남기지 않았다 — 검사가 죽은 채로 통과할 뻔했다"
    offenders = json.loads(report.read_text())
    assert not offenders, (
        "실제 LLM 을 부르는 테스트가 있다. 스텁하거나 eval 로 옮겨라:\n  "
        + "\n  ".join(f"{c}회  {n}" for n, c in offenders.items())
    )
