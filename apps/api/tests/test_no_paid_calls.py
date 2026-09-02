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

#: 프로브가 감시하는 이름 (오류 메시지용 — 프로브 안 정의와 같이 유지)
_PAID_METHODS = ("create", "parse", "stream")

_PROBE = """
import json, os
from collections import Counter

import pytest

CALLS = Counter()
#: 실제로 가로챈 메서드. 비어 있으면 감시가 **아무 데도 안 붙은** 것이다 —
#: 그 상태로 CALLS 가 {} 라서 검사는 조용히 통과한다 (적대적 리뷰 M5, 2026-09-02).
PATCHED = []


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
        if name not in PATCHED:
            PATCHED.append(name)


def pytest_sessionfinish(session, exitstatus):
    # sessionfinish 의 print 는 pytest 가 삼킨다 (2026-09-02 그렇게 한 번 놓쳤다).
    # 파일로 남긴다.
    Path = __import__("pathlib").Path
    Path(os.environ["PAID_CALL_REPORT"]).write_text(
        json.dumps({"calls": dict(CALLS), "patched": PATCHED}, ensure_ascii=False))
"""


def test_suite_makes_no_real_llm_calls(tmp_path):
    """`anthropic.Messages.create` 를 실제로 부르는 테스트가 없어야 한다.

    자기 자신은 제외한다 (재귀 방지).
    """
    probe = API / "tests" / "_paid_probe.py"
    report = tmp_path / "paid.json"
    probe.write_text(_PROBE)
    try:
        r = subprocess.run(
            [sys.executable, "-m", "pytest", "tests/", "-q", "-p", "tests._paid_probe",
             "--deselect", "tests/test_no_paid_calls.py"],
            cwd=API, capture_output=True, text=True, timeout=900,
            env={**os.environ, "PAID_CALL_REPORT": str(report)},
        )
    finally:
        probe.unlink(missing_ok=True)

    assert report.exists(), "프로브가 결과를 남기지 않았다 — 검사가 죽은 채로 통과할 뻔했다"
    rec = json.loads(report.read_text())
    # 수집 오류(2)·내부 오류(3+)면 테스트가 아예 안 돌았을 수 있다. 0=전부 통과,
    # 1=일부 실패 — 둘 다 '돌긴 했다'. 그 밖은 이 검사의 전제가 무너진 것이다.
    assert r.returncode in (0, 1), (
        f"프로브 실행이 비정상 종료했다 (exit {r.returncode}). "
        f"테스트가 안 돌았을 수 있다:\n{r.stdout[-1500:]}")
    assert rec["patched"], (
        "감시를 아무 메서드에도 못 붙였다 — anthropic SDK 가 메서드를 옮겼을 수 있다. "
        f"찾던 이름: {_PAID_METHODS}")
    offenders = rec["calls"]
    assert not offenders, (
        "실제 LLM 을 부르는 테스트가 있다. 스텁하거나 eval 로 옮겨라:\n  "
        + "\n  ".join(f"{c}회  {n}" for n, c in offenders.items())
    )


def test_the_detector_actually_detects(tmp_path):
    """**양성 대조** — 감시기가 실제로 잡는지 매 실행 확인한다.

    사고 이력 2026-09-02 (적대적 리뷰 M5): 위 검사는 "아무도 안 불렀다"를 주장하는데,
    감시기가 고장 나도 똑같이 "아무도 안 불렀다"가 나온다. 두 상태를 구분할 방법이
    없으면 그건 검사가 아니다. 그래서 **부르는 테스트를 일부러 하나 만들어** 잡히는지
    본다. 안 잡히면 위 검사의 통과는 아무 의미가 없다.
    """
    probe = API / "tests" / "_paid_probe.py"
    canary = API / "tests" / "_paid_canary.py"
    report = tmp_path / "canary.json"
    probe.write_text(_PROBE)
    canary.write_text(
        "def test_canary_calls_paid_api():\n"
        "    import anthropic.resources.messages as M\n"
        "    M.Messages.create(object(), model='x', max_tokens=1, messages=[])\n")
    try:
        subprocess.run(
            [sys.executable, "-m", "pytest", "tests/_paid_canary.py", "-q",
             "-p", "tests._paid_probe"],
            cwd=API, capture_output=True, text=True, timeout=120,
            env={**os.environ, "PAID_CALL_REPORT": str(report)},
        )
    finally:
        probe.unlink(missing_ok=True)
        canary.unlink(missing_ok=True)

    assert report.exists(), "양성 대조에서도 프로브가 결과를 안 남겼다"
    rec = json.loads(report.read_text())
    assert rec["calls"], (
        "일부러 유료 호출을 하는 테스트를 감시기가 **못 잡았다**. "
        "위 검사의 '0건' 은 신뢰할 수 없다.")
