#!/usr/bin/env python3
"""
scripts/harness.py — 폴더 단위 테스트 + 정적 검사 + 문서 정합성 검사 (도메인 무관 일반화판)

이 파일은 프로젝트 도메인에 대해 아무것도 모른다. 모든 프로젝트별 사실은
meta/project_state.yaml 과 각 폴더의 _GUIDE.md 에서 읽는다.

사용법:
    python scripts/harness.py <folder>/        # 폴더 단위 테스트
    python scripts/harness.py <folder>/x.py    # 파일 단위 (부모 폴더로 승격)
    python scripts/harness.py <folder>/ --gc   # + 정적 검사 (금지 패턴/노후/미사용 import)
    python scripts/harness.py <folder>/ --diff # 직전 실행 대비 신규 실패만
    python scripts/harness.py all              # 전체 + Doc Lint

테스트 목록 해석 순서:
    1) 해당 폴더 _GUIDE.md 의 "## 하네스" 섹션 코드블록 (tests/... 줄)
    2) 관례 탐색: tests/unit/test_<folder>*.py, tests/integration/test_<folder>*.py
    3) 없으면 no_tests (실패 아님, 경고)
"""
from __future__ import annotations

import argparse
from urllib.parse import urlparse
import json
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = ROOT / ".harness_cache"
CACHE_DIR.mkdir(exist_ok=True)
META_PATH = ROOT / "meta" / "project_state.yaml"

# ── 기본 설정 (meta/project_state.yaml 의 harness: 블록으로 덮어쓸 수 있음) ──
DEFAULTS = {
    "tasks_doc": "TASKS.md",
    "backlog_doc": "BACKLOG.md",
    "index_doc": "CLAUDE.md",
    "archive_dir": "docs/sprints",
    "guide_filename": "_GUIDE.md",
    "harness_section": "하네스",          # _GUIDE.md 안의 테스트 목록 섹션 제목
    "gc_section": "GC 패턴",              # _GUIDE.md 안의 기계 검사 패턴 섹션 제목
    "max_active_tasks": 3,
    "task_heading_regex": r"^#{2,3} [A-Z][A-Z0-9]*-[A-Za-z0-9]+:",  # ##/### · 다글자 ID 허용
    "done_status_regex": r"\*\*상태\*\*:\s*(completed|✅)",
    "backlog_state_regex": r"## 현재 상태 \((\d{4}-\d{2}-\d{2}) 기준\)",
    "index_date_regex": r"^\| (\d{4}-\d{2}-\d{2})",
    "test_globs": ["tests/unit/test_{key}*.py", "tests/integration/test_{key}*.py"],
    # _GUIDE.md '## 하네스' 목록에서 테스트로 인정할 경로 접두어.
    # 모노레포는 테스트가 루트 tests/ 에 있지 않다.
    "test_path_prefixes": ["tests/"],
    "always_run": ["tests/invariants"],   # all 실행 시 항상 포함
    "secret_exts": ["*.py", "*.yaml", "*.yml", "*.md", "*.ts", "*.js", "*.go", "*.rs"],
    "skip_dirs": ["__pycache__", ".venv", "venv", "node_modules", ".git", "tests",
                  "site-packages", "dist", "build"],
    "ruff": True,
    # 자리표시자 — 커밋이 grace_commits 를 넘어서도 남아 있으면 FAIL (설치 직후엔 유예)
    "placeholders": ["{프로젝트명}", "{폴더명}", "X-001: 태스크 이름",
                     "(sprint-close 가 1줄씩 추가", "마지막 갱신: YYYY-MM-DD"],
    "grace_commits": 3,
    # all 실행 시 같이 돌릴 외부 검사. 파일이 있을 때만 실행한다.
    # (2026-08-26 발견: deps_check 가 harness 에 안 물려 있어서 경계 검사가 커밋 때
    #  자동으로 안 돌고 있었다 — 사람이 따로 쳐야만 도는 검사는 결국 안 도는 검사다)
    "extra_checks": [
        ["scripts/deps_check.py"],
        ["scripts/feature_view.py", "--list"],
    ],
}

_PH = r"(?!your_|test[-_]|example|placeholder|dummy|<|xxx)"   # 플레이스홀더 제외
SECRET_PATTERNS = [
    (r"sk-[A-Za-z0-9]{20,}",                                   "sk- 형식 키 하드코딩"),
    (r"gh[pousr]_[A-Za-z0-9]{20,}",                            "GitHub 토큰 하드코딩"),
    (r"AKIA[0-9A-Z]{16}",                                      "AWS access key 하드코딩"),
    (r"[A-Z_]*API_KEY\s*[=:]\s*[\"']?" + _PH + r"[A-Za-z0-9_\-]{16,}", "API_KEY 하드코딩"),
    (r"[A-Z_]*SECRET\s*[=:]\s*[\"']?" + _PH + r"[A-Za-z0-9_\-]{16,}",  "SECRET 하드코딩"),
    (r"-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----",       "개인키 파일 내용 커밋"),
]


# ── 설정 로딩 ────────────────────────────────────────────────────────────────

def load_meta() -> dict:
    """meta/project_state.yaml 을 읽는다. **실패하면 죽는다.**

    사고 이력(2026-08-27): PyYAML 이 없으면 조용히 {} 를 반환했다. 그러면
    test_path_prefixes 가 기본값 ["tests/"] 로 돌아가 _GUIDE.md 의
    `apps/api/tests/...` 줄이 전부 걸러지고, all_folders() 는 glob 폴백으로
    폴더 7개를 그럴듯하게 채운다. 결과는 **"테스트 0개 · harness all 통과"**.
    설정을 못 읽은 하네스가 초록불을 내는 것이 하네스가 없는 것보다 나쁘다.
    """
    if not META_PATH.exists():
        return {}
    try:
        import yaml
    except ImportError:
        sys.exit(
            "❌ PyYAML 이 없어 meta/project_state.yaml 을 읽을 수 없다.\n"
            "   설정 없이 돌면 테스트 0개로 '통과'가 나온다 — 그래서 여기서 멈춘다.\n"
            "   python3 -m pip install pyyaml"
        )
    try:
        meta = yaml.safe_load(META_PATH.read_text()) or {}
    except Exception as e:
        sys.exit(f"❌ meta/project_state.yaml 파싱 실패: {e}")
    if not meta.get("harness"):
        sys.exit("❌ meta/project_state.yaml 에 harness: 블록이 없다 — 설정 없이 돌지 않는다.")
    return meta


META = load_meta()
CFG = {**DEFAULTS, **(META.get("harness") or {})}


# ── _GUIDE.md 파싱 ──────────────────────────────────────────────────────────

def parse_guide_tests(guide_path: Path) -> list[str]:
    """_GUIDE.md '## 하네스' 섹션의 코드블록에서 tests/ 로 시작하는 줄 수집."""
    if not guide_path.exists():
        return []
    m = re.search(rf"## {re.escape(CFG['harness_section'])}.*?```\s*(.*?)```",
                  guide_path.read_text(), re.DOTALL)
    if not m:
        return []
    out = []
    for line in m.group(1).splitlines():
        line = line.strip().lstrip("-").strip()
        if any(line.startswith(pre) for pre in CFG.get("test_path_prefixes", ["tests/"])):
            out.append(line)
    return out


def parse_guide_gc(guide_path: Path) -> list[tuple[str, str]]:
    """_GUIDE.md 의 ```gc 펜스 블록에서 (정규식, 메시지, 제외정규식) 파싱.

        ```gc
        pattern: "except Exception:\\s*pass"
        message: "silent failure 금지 — 반드시 로깅"
        exclude: "llm/client\\.py"
        ```

    `exclude` 는 **파일 경로** 정규식이다. 규칙이 자기 구현을 잡는 경우에만 쓴다
    (예: "messages.create 직접 호출 금지" 가 그 창구인 client.py 를 잡는다).
    사고 이력 2026-09-02: 제외 수단이 없어 이 규칙이 항상 1건 오탐을 내고 있었고,
    그래서 아무도 `--gc` 를 harness all 에 넣지 못했다 — 규칙이 배선되지 못한 이유가
    규칙 자신이었다.
    """
    if not guide_path.exists():
        return []
    text = guide_path.read_text()
    blocks = re.findall(r"```gc\s*(.*?)```", text, re.DOTALL)
    if not blocks:
        m = re.search(rf"## {re.escape(CFG['gc_section'])}.*?```(.*?)```", text, re.DOTALL)
        blocks = [m.group(1)] if m else []
    pairs: list[tuple[str, str, str]] = []
    for block in blocks:
        # pattern 단위로 잘라 각 항목의 message·exclude 를 짝지어 읽는다.
        # exclude 가 없으면 빈 문자열 = 아무 파일도 제외하지 않음.
        chunks = re.split(r'(?=pattern:\s*")', block)
        for chunk in chunks:
            m = re.search(r'pattern:\s*"([^"]+)"', chunk)
            if not m:
                continue
            msg = re.search(r'message:\s*"([^"]+)"', chunk)
            exc = re.search(r'exclude:\s*"([^"]+)"', chunk)
            pairs.append((m.group(1), msg.group(1) if msg else "",
                          exc.group(1) if exc else ""))
    return pairs


# ── 대상 해석 ────────────────────────────────────────────────────────────────

def guide_for(folder: Path) -> Path:
    """폴더에 _GUIDE.md 가 없으면 상위로 거슬러 올라가며 탐색."""
    cur = folder
    while True:
        g = ROOT / cur / CFG["guide_filename"]
        if g.exists():
            return g
        if str(cur) in (".", "", "/"):
            return ROOT / folder / CFG["guide_filename"]
        cur = cur.parent


def resolve_target(target: str) -> tuple[str, Path]:
    p = Path(target.rstrip("/"))
    if p.suffix:                       # 파일 단위 → 부모 폴더로 승격
        p = p.parent
    return str(p), guide_for(p)


def get_tests(folder_key: str, guide_path: Path) -> list[str]:
    from_guide = parse_guide_tests(guide_path)
    if from_guide:
        return from_guide
    key = folder_key.replace("/", "_").strip("_")
    found: list[str] = []
    for pattern in CFG["test_globs"]:
        found += [str(p.relative_to(ROOT)) for p in ROOT.glob(pattern.format(key=key))]
    return sorted(set(found))


# ── 테스트 실행 ─────────────────────────────────────────────────────────────

def runner_for(folder_key: str) -> list[str] | None:
    """폴더별 테스트 실행 명령. 없으면 pytest.

    파이썬만 있는 저장소를 전제하면 앱이 하나 더 붙는 순간 하네스 밖으로 샌다.
    새 앱은 meta/project_state.yaml 의 harness.runners 에 자기 명령을 등록한다.
    """
    runners = (CFG.get("runners") or {})
    cmd = runners.get(folder_key)
    return list(cmd) if cmd else None


def run_tests(tests: list[str], runner: list[str] | None = None) -> dict:
    if not tests:
        return {"status": "no_tests", "passed": 0, "failed": 0, "errors": []}
    existing = [t for t in tests if (ROOT / t).exists()]
    missing = [t for t in tests if not (ROOT / t).exists()]
    if not existing:
        return {"status": "missing", "passed": 0, "failed": 0,
                "errors": [f"테스트 경로 없음: {t}" for t in missing]}

    cmd = ([*runner, *existing] if runner
           else [sys.executable, "-m", "pytest", *existing, "-q", "--tb=short"])
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT)
    out = r.stdout + r.stderr
    n_pass = int(m.group(1)) if (m := re.search(r"(\d+) passed", out)) else 0
    n_fail = int(m.group(1)) if (m := re.search(r"(\d+) failed", out)) else 0
    if runner and not n_pass and not n_fail and r.returncode == 0:
        # 러너가 개수를 안 찍는 경우(tsc 등)도 통과는 통과로 센다
        n_pass = len(existing)
    return {"status": "pass" if r.returncode == 0 else "fail",
            "passed": n_pass, "failed": n_fail, "returncode": r.returncode,
            "output": out, "tests": existing, "missing": missing,
            "failed_names": re.findall(r"^(FAILED|ERROR) (\S+)", out, re.MULTILINE)}


# ── GC (정적 검사) ──────────────────────────────────────────────────────────

def _module_token(path: Path) -> str | None:
    """가이드가 언급해야 할 이름. 라우트면 폴더명, 그 외엔 파일명."""
    if path.name in ("__init__.py",) or path.name.startswith("_"):
        return None
    if path.name in ("page.tsx", "route.ts", "layout.tsx"):
        return path.parent.name  # app/policy/page.tsx → 'policy'
    return path.name


def check_guide_staleness(folder_key: str, guide_path: Path) -> dict | None:
    if not guide_path.exists():
        return None
    folder = ROOT / folder_key
    if not folder.is_dir():
        return None
    srcs = [f for f in folder.rglob("*.*")
            if f.suffix in {".py", ".ts", ".js", ".go", ".rs"}
            and not any(s in f.parts for s in CFG["skip_dirs"])]
    if not srcs:
        return None
    newest = max(srcs, key=lambda f: f.stat().st_mtime)
    delta = (newest.stat().st_mtime - guide_path.stat().st_mtime) / 86400
    if delta > 0:
        return {"type": "stale_guide", "file": str(guide_path.relative_to(ROOT)),
                "message": f"_GUIDE.md 가 최신 코드보다 {int(delta)}일 오래됨 "
                           f"(최근 변경: {newest.relative_to(ROOT)}) — 규칙 갱신 검토"}
    return None


def run_gc(folder_key: str, guide_path: Path) -> list[dict]:
    findings: list[dict] = []
    folder = ROOT / folder_key
    files = [f for f in folder.rglob("*.py")
             if not any(s in f.parts for s in CFG["skip_dirs"])] if folder.is_dir() else []

    for pattern, message, exclude in parse_guide_gc(guide_path):
        try:
            rx = re.compile(pattern)
            ex = re.compile(exclude) if exclude else None
        except re.error as e:
            findings.append({"type": "bad_gc_pattern", "file": str(guide_path.relative_to(ROOT)),
                             "message": f"GC 정규식 오류 {pattern!r}: {e}"})
            continue
        for f in files:
            if ex is not None and ex.search(str(f.relative_to(ROOT))):
                continue
            content = f.read_text(errors="ignore")
            for m in rx.finditer(content):          # 줄바꿈 걸친 패턴도 잡히도록 전문 검색
                line_no = content.count("\n", 0, m.start()) + 1
                findings.append({"type": "forbidden_pattern",
                                 "file": f"{f.relative_to(ROOT)}:{line_no}",
                                 "pattern": pattern, "message": message})

    if not guide_path.exists():
        findings.append({"type": "missing_guide", "file": str(guide_path.relative_to(ROOT)),
                         "message": "_GUIDE.md 없음 — 폴더 규칙 미설정"})
    else:
        if (stale := check_guide_staleness(folder_key, guide_path)):
            findings.append(stale)

    if CFG["ruff"] and folder.exists():
        r = subprocess.run([sys.executable, "-m", "ruff", "check", str(folder),
                            "--select=F401", "--quiet"],
                           capture_output=True, text=True, cwd=ROOT)
        if r.returncode not in (0, 1) or not r.stdout:
            pass
        for line in r.stdout.splitlines()[:10]:
            findings.append({"type": "unused_import", "message": line.strip()})
    return findings


# ── Doc Lint (프로젝트 문서 정합성) ─────────────────────────────────────────

# ── 문서 앵커 (2026-08-26 신설) ─────────────────────────────────────────────
# _GUIDE.md 만 잘 갱신되는 이유는 **기계적 앵커**가 있기 때문이다 — 코드에 파일을 추가하면
# 자동으로 "가이드에 언급됐나" 검사가 생긴다. 코드 변화가 문서 요구를 만든다.
# CLAUDE/DEV_GUIDE/TASKS 엔 그 앵커가 없어서 "갱신하세요"라는 문장만 있었고, 실측 결과
# 13커밋 동안 세 문서 전부 템플릿과 0줄 차이였다. 아래는 각 문서에 저절로 변하는 것을 묶은 것.

def commit_count() -> int:
    if not (ROOT / ".git").exists():
        return 0
    r = subprocess.run(["git", "rev-list", "--count", "HEAD"],
                       cwd=ROOT, capture_output=True, text=True)
    return int(r.stdout.strip()) if r.returncode == 0 and r.stdout.strip().isdigit() else 0


def check_anchors() -> list[dict]:
    f: list[dict] = []
    n = commit_count()
    if n <= CFG.get("grace_commits", 3):
        return f
    tasks_p, index_p = ROOT / CFG["tasks_doc"], ROOT / CFG["index_doc"]
    dev_p, archive = ROOT / "DEV_GUIDE.md", ROOT / CFG["archive_dir"]

    # ① 자리표시자 잔존
    for doc in (CFG["index_doc"], CFG["tasks_doc"], CFG["backlog_doc"], "DEV_GUIDE.md"):
        dp = ROOT / doc
        if dp.exists():
            hits = [ph for ph in CFG["placeholders"] if ph in dp.read_text()]
            if hits:
                f.append({"level": "FAIL", "type": "placeholder_left", "file": doc,
                          "message": f"자리표시자 잔존 {hits} — 커밋 {n}개째인데 템플릿 그대로다"})

    # ② TASKS 앵커 = 커밋 수
    if tasks_p.exists():
        body = tasks_p.read_text()
        has_task = re.search(CFG["task_heading_regex"], body, re.MULTILINE)
        declared_empty = "현재 스프린트: 없음" in body
        if not has_task and not declared_empty:
            f.append({"level": "FAIL", "type": "tasks_empty", "file": CFG["tasks_doc"],
                      "message": f"커밋 {n}개인데 현재 태스크도 '현재 스프린트: 없음' 선언도 없다"})
        elif declared_empty:
            # '없음' 선언은 면제가 아니다. 그 상태로 커밋이 계속 쌓이면 작업이 TASKS 를
            # 안 거치고 흘러간다는 뜻이다. (실측: '없음' 상태에서 커밋 4개가 나갔다 —
            # 하네스 배선·접근성 수정 전부 태스크 없이 진행됐고 아무도 몰랐다)
            r = subprocess.run(["git", "log", "-1", "--format=%H", "--", CFG["tasks_doc"]],
                               cwd=ROOT, capture_output=True, text=True)
            base = r.stdout.strip()
            if base:
                c = subprocess.run(["git", "rev-list", "--count", f"{base}..HEAD"],
                                   cwd=ROOT, capture_output=True, text=True)
                since = int(c.stdout.strip()) if c.stdout.strip().isdigit() else 0
                if since > CFG.get("grace_commits", 3):
                    f.append({"level": "WARN", "type": "tasks_bypassed", "file": CFG["tasks_doc"],
                              "message": f"'현재 스프린트: 없음' 선언 이후 커밋 {since}개 — "
                                         "작업이 TASKS 를 안 거치고 흘러가고 있다"})

    # ③ CLAUDE 앵커 = 아카이브 개수
    if index_p.exists() and archive.is_dir():
        n_arch = len([p for p in archive.glob("*.md") if "TEMPLATE" not in p.name])
        n_rows = len(re.findall(CFG["index_date_regex"], index_p.read_text(), re.MULTILINE))
        if n_arch > n_rows:
            f.append({"level": "FAIL", "type": "index_behind_archive", "file": CFG["index_doc"],
                      "message": f"아카이브 {n_arch}건 vs 완료 테이블 {n_rows}행 — 1줄 추가 누락"})

    # ④ DEV_GUIDE 앵커 = meta.folder_guides
    if dev_p.exists():
        dev = dev_p.read_text()
        missing = [k for k in (META.get("folder_guides") or {}) if k not in dev]
        if missing:
            f.append({"level": "FAIL", "type": "devguide_missing_folder", "file": "DEV_GUIDE.md",
                      "message": f"색인에 없는 폴더 {missing}"})

    # ⑤ 등록 안 된 테스트 — 디스크에 있는데 어느 _GUIDE.md 에도 없다
    #    _GUIDE.md 의 '## 하네스' 목록이 곧 실행 allowlist 다. 목록에 안 올리면
    #    파일이 있어도 harness 가 안 돌린다 — **있는데 안 도는 테스트**가 된다.
    #    (2026-08-27 발견: apps/web/tests/gap.test.ts 가 등록 없이 방치돼 있었고,
    #     harness all 은 8개 중 6개만 돌면서 초록불을 냈다. 아무도 몰랐다.)
    listed: set[str] = set()
    for gpath in (META.get("folder_guides") or {}).values():
        gp = ROOT / gpath
        if gp.exists():
            listed.update(parse_guide_tests(gp))
    on_disk: set[str] = set()
    for pre in CFG.get("test_path_prefixes", ["tests/"]):
        d = ROOT / pre
        if d.is_dir():
            for q in d.rglob("*"):
                if q.is_file() and re.match(r"^(test_.*\.py|.*\.test\.[tj]sx?)$", q.name):
                    on_disk.add(str(q.relative_to(ROOT)))
    orphans = sorted(on_disk - listed)
    if orphans:
        f.append({"level": "FAIL", "type": "unregistered_test", "file": "(테스트)",
                  "message": f"_GUIDE.md '## 하네스' 에 없어 실행되지 않는 테스트 {orphans}"})

    # ⑤ ui_check 노후 — 화면을 바꾼 뒤 검사를 안 돌렸다
    #    ui_check 는 서버가 떠 있어야 해서 커밋 훅에 못 넣는다. 그렇다고 조용히 두면
    #    "있는데 아무도 안 부르는" 상태가 되고, 그게 제일 나쁘다 — 도구가 있다는 사실이
    #    안심을 주는데 실제로는 아무것도 안 지키니까. 그래서 **안 돌린 사실**을 잡는다.
    #    (실측: 정부 포털 톤을 표방한 화면이 WCAG AA 를 75~110건 어기고 있었는데,
    #     검사기는 저장소에 있었고 한 번도 실행된 적이 없었다)
    ui = META.get("ui_check") or {}
    if ui.get("watch"):
        newest, newest_file = 0.0, None
        for pat in ui["watch"]:
            for q in ROOT.glob(pat):
                if q.is_file() and not any(s in q.parts for s in CFG["skip_dirs"]):
                    m = q.stat().st_mtime
                    if m > newest:
                        newest, newest_file = m, q
        rec = ROOT / ".harness_cache" / "ui_check.json"
        level = (ui.get("level") or "WARN").upper()
        if newest and not rec.exists():
            f.append({"level": level, "type": "ui_check_never_run", "file": "(화면)",
                      "message": "ui_check 를 한 번도 안 돌렸다 — "
                                 "python scripts/ui_check.py <URL> --all-viewports"})
        elif newest:
            import datetime as _dt
            rr = json.loads(rec.read_text())
            ts = rr.get("ts", 0)
            when = _dt.datetime.fromtimestamp(ts).strftime("%m-%d %H:%M")
            if newest > ts:
                f.append({"level": level, "type": "ui_check_stale", "file": str(newest_file.relative_to(ROOT)),
                          "message": f"마지막 ui_check({when}) 이후 화면이 바뀌었다 — 다시 돌릴 것"})
            # 시각만 보면 **23개 중 1개만 돌려도** 게이트가 충족된다.
            # 2026-09-02 적대적 리뷰 M4 가 실제로 그 상태를 잡아냈다 — 새로 추가된
            # /app/checkup·/app/map·/app/levers·/app/prescribe 는 targets 에 올라가
            # 있었지만 한 번도 검사된 적이 없는데 harness 는 깨끗하게 통과했다.
            # 2026-08-28 에 "숨어 있던 위반 24건" 으로 고친 것과 같은 구멍의 다른 모양.
            declared = {str(x.get("path", x)) for x in (ui.get("targets") or [])}
            checked = {urlparse(u).path or "/" for u in (rr.get("targets") or [])}
            if (missing := sorted(declared - checked)):
                f.append({"level": level, "type": "ui_check_partial", "file": "(화면)",
                          "message": (f"선언된 {len(declared)}개 중 {len(missing)}개가 "
                                      f"마지막 실행({when})에 빠졌다: {missing[:6]}"
                                      f"{' …' if len(missing) > 6 else ''}")})

    # ⑥ 깨진 문서 참조
    targets = [p for p in ROOT.glob("**/*.md")
               if not any(s in p.parts for s in CFG["skip_dirs"] + ["templates", "node_modules"])]
    targets += list((ROOT / "meta").glob("*.yaml")) if (ROOT / "meta").is_dir() else []
    for doc in targets:
        for ref in set(re.findall(r"(docs/[\w./-]+\.md)", doc.read_text(errors="ignore"))):
            if not (ROOT / ref).exists():
                f.append({"level": "FAIL", "type": "broken_doc_ref",
                          "file": str(doc.relative_to(ROOT)),
                          "message": f"존재하지 않는 문서 참조: {ref}"})
    return f


def run_doc_lint() -> list[dict]:
    """규칙이 문서에만 있으면 안 지켜진다 — 문서 자체를 기계 검사한다."""
    f: list[dict] = []
    tasks_p, backlog_p, index_p = (ROOT / CFG["tasks_doc"], ROOT / CFG["backlog_doc"],
                                   ROOT / CFG["index_doc"])

    # 1) 활성 태스크 문서
    if tasks_p.exists():
        text = tasks_p.read_text()
        if re.search(CFG["done_status_regex"], text):
            f.append({"level": "FAIL", "type": "tasks_done_body", "file": CFG["tasks_doc"],
                      "message": f"완료 태스크 본문 잔존 — {CFG['archive_dir']}/ 로 이동 필요"})
        active = re.findall(CFG["task_heading_regex"], text, re.MULTILINE)
        # 규칙 자기검사 — 규칙은 조용히 죽는다. 표기 관례가 바뀌면 정규식이 0건 매치로
        # 전락하는데, 출력은 "문제 없음"과 구분되지 않는다. (원본 프로젝트 실측:
        # ID 체계가 X-001 → DATA-001 로 진화하면서 상한 규칙이 수개월간 사망 상태)
        if not active and len(text) > 500:
            f.append({"level": "WARN", "type": "rule_not_firing", "file": CFG["tasks_doc"],
                      "message": f"태스크 헤딩 정규식 {CFG['task_heading_regex']!r} 0건 매치 — "
                                 "표기 관례 변경으로 상한 규칙이 사망했을 가능성"})
        if len(active) > CFG["max_active_tasks"]:
            f.append({"level": "FAIL", "type": "tasks_overflow", "file": CFG["tasks_doc"],
                      "message": f"활성 태스크 {len(active)}개 — 상한 {CFG['max_active_tasks']} 초과"})
        for link in re.findall(rf"`({re.escape(CFG['archive_dir'])}/[^`]+\.md)`", text):
            if not (ROOT / link).exists():
                f.append({"level": "FAIL", "type": "broken_archive_link", "file": CFG["tasks_doc"],
                          "message": f"아카이브 링크 깨짐: {link}"})

    # 2) 백로그 최신성 (인덱스 문서의 최신 스프린트 날짜와 대조)
    if backlog_p.exists() and index_p.exists():
        m = re.search(CFG["backlog_state_regex"], backlog_p.read_text())
        dates = re.findall(CFG["index_date_regex"], index_p.read_text(), re.MULTILINE)
        if m is None:
            f.append({"level": "FAIL", "type": "backlog_state_header", "file": CFG["backlog_doc"],
                      "message": "'## 현재 상태 (YYYY-MM-DD 기준)' 헤더 없음 — 최신성 검사 불가"})
        elif dates and m.group(1) < max(dates):
            f.append({"level": "FAIL", "type": "backlog_stale", "file": CFG["backlog_doc"],
                      "message": f"백로그 현재 상태({m.group(1)})가 최신 스프린트({max(dates)})보다 과거"})

    # 3) _GUIDE.md 모듈 커버리지 — 새 모듈이 규칙 문서에 등장하지 않으면 FAIL
    for guide in ROOT.glob(f"**/{CFG['guide_filename']}"):
        if any(s in guide.parts for s in CFG["skip_dirs"] + ["docs", "templates"]):
            continue
        text = guide.read_text()
        key = str(guide.parent.relative_to(ROOT))
        # 언어별로 '모듈' 의 모양이 다르다. 파이썬만 검사하면 웹 앱은 가이드가
        # 썩어도 린트를 통과한다 — 앱이 하나 더 붙는 순간 하네스가 무의미해진다.
        globs = (CFG.get("module_globs") or {}).get(key, ["*.py"])
        unmentioned = sorted(
            {_module_token(m) for g in globs for m in guide.parent.glob(g)}
            - {None}
        )
        unmentioned = [n for n in unmentioned if n not in text]
        if unmentioned:
            f.append({"level": "FAIL", "type": "guide_module_missing",
                      "file": str(guide.relative_to(ROOT)),
                      "message": f"가이드 미언급 모듈 {len(unmentioned)}개: {', '.join(unmentioned)}"})
        if "## 최근 변경" in text:
            f.append({"level": "WARN", "type": "guide_recent_changes",
                      "file": str(guide.relative_to(ROOT)),
                      "message": "'## 최근 변경' 섹션 존재 — 변경 이력은 git 이 소유"})

    # 4) meta 검증 — 여기 적힌 파일은 반드시 존재해야 한다
    for name, path in (META.get("entry_points") or {}).items():
        if not (ROOT / path).exists():
            f.append({"level": "FAIL", "type": "missing_entry_point", "file": path,
                      "message": f"entry_points.{name} 파일 없음 — meta 갱신 필요"})
    for folder, guide in (META.get("folder_guides") or {}).items():
        if not (ROOT / guide).exists():
            f.append({"level": "WARN", "type": "missing_folder_guide", "file": guide,
                      "message": f"folder_guides.{folder} 없음"})
    if (ad := META.get("archive_dir") or CFG["archive_dir"]) and not (ROOT / ad).exists():
        f.append({"level": "WARN", "type": "missing_archive_dir", "file": ad,
                  "message": "아카이브 디렉토리 없음"})

    # 5) 시크릿 스캔
    targets: list[Path] = []
    for ext in CFG["secret_exts"]:
        targets += list(ROOT.rglob(ext))
    for t in targets:
        if any(s in t.parts for s in CFG["skip_dirs"]):
            continue
        try:
            content = t.read_text(errors="ignore")
        except Exception:
            continue
        for pattern, desc in SECRET_PATTERNS:
            if re.search(pattern, content):
                f.append({"level": "FAIL", "type": "secret_pattern",
                          "file": str(t.relative_to(ROOT)),
                          "message": f"시크릿 하드코딩 의심: {desc}"})
                break
    f += check_anchors()          # 문서 앵커 (자리표시자·빈 태스크·색인 지연·깨진 참조)
    return f


# ── 규칙 커버리지 (계기판) ──────────────────────────────────────────────────

def run_rule_coverage() -> dict:
    """'지금 몇 개의 규칙이 발화 가능한 상태인가'를 잰다.

    규칙 자체를 검사하지 않으면 규칙은 조용히 죽는다. 원본 프로젝트 실측에서
    산문 금지사항 74건 중 기계 집행은 4건(5%)뿐이었고, 출력이 "GC: 0건"이라
    패턴이 없어서 0건인지 깨끗해서 0건인지 구분할 수 없었다.
    """
    rows = []
    for guide in sorted(ROOT.glob(f"**/{CFG['guide_filename']}")):
        if any(s in guide.parts for s in CFG["skip_dirs"] + ["docs", "templates"]):
            continue
        key = str(guide.parent.relative_to(ROOT))
        text = guide.read_text()
        rows.append({"folder": key,
                     "gc_patterns": len(parse_guide_gc(guide)),
                     "prose_bans": len(re.findall(r"^### ❌", text, re.MULTILINE)),
                     "tests": len(get_tests(key, guide))})
    return {"rows": rows, "n_folders": len(rows),
            "n_with_gc": sum(1 for r in rows if r["gc_patterns"]),
            "n_gc_total": sum(r["gc_patterns"] for r in rows),
            "n_prose_total": sum(r["prose_bans"] for r in rows)}


def print_rule_coverage(cov: dict) -> None:
    print("\n" + "─" * 46 + "\n  규칙 커버리지 (기계 집행 vs 산문)")
    print(f"  {'폴더':<18} {'GC패턴':>7} {'산문금지':>8} {'테스트':>6}")
    for r in sorted(cov["rows"], key=lambda x: (x["gc_patterns"], -x["prose_bans"])):
        mark = "  " if r["gc_patterns"] else "⚠️"
        print(f"  {mark}{r['folder']:<16} {r['gc_patterns']:>7} {r['prose_bans']:>8} {r['tests']:>6}")
    ratio = cov["n_gc_total"] / max(1, cov["n_prose_total"])
    print(f"\n  폴더 {cov['n_folders']}개 중 GC 보유 {cov['n_with_gc']}개 — "
          f"산문 금지 {cov['n_prose_total']}건 대비 기계 집행 {cov['n_gc_total']}건 ({ratio:.0%})")
    print("  ⚠️ = 금지사항이 문장으로만 존재 (harness --gc 가 검사하지 못함)")


# ── 출력 / 캐시 ─────────────────────────────────────────────────────────────

def print_doc_lint(findings: list[dict]) -> bool:
    print("\n" + "─" * 46 + "\n  Doc Lint")
    if not findings:
        print("  ✅ 통과")
        return True
    for x in sorted(findings, key=lambda d: d["level"] != "FAIL"):
        icon = "❌" if x["level"] == "FAIL" else "⚠️ "
        print(f"  {icon} [{x['type']}] {x.get('file','')}: {x['message']}")
    return not any(x["level"] == "FAIL" for x in findings)


def cache_path(key: str) -> Path:
    return CACHE_DIR / f"{key.replace('/', '_').strip('_') or 'all'}.json"


def print_diff(prev: dict, curr: dict) -> None:
    prev_fail = {n for _, n in prev.get("failed_names", [])}
    curr_fail = {n for _, n in curr.get("failed_names", [])}
    new, fixed = curr_fail - prev_fail, prev_fail - curr_fail
    print("\n  변화:")
    for n in sorted(new):
        print(f"    🔴 신규 실패 {n}")
    for n in sorted(fixed):
        print(f"    🟢 해결됨   {n}")
    if not new and not fixed:
        print("    (직전 실행과 동일)")


def run_one(target: str, gc: bool, diff: bool) -> bool:
    folder_key, guide = resolve_target(target)
    tests = get_tests(folder_key, guide)
    print(f"\n{'='*46}\n  대상: {folder_key}  |  가이드: {guide.relative_to(ROOT)}")
    print(f"  테스트: {len(tests)}개")
    result = run_tests(tests, runner_for(folder_key))

    if result["status"] == "no_tests":
        print("  ⚠️  테스트 미지정 — _GUIDE.md '## 하네스' 섹션에 목록 추가 권장")
    elif result["status"] == "missing":
        # 가이드가 존재하지 않는 테스트를 가리킨다 — 실패지만 traceback 은 아니다.
        # (2026-08-26 시운전에서 발견: 새 프로젝트는 템플릿이 약속한 테스트가 아직 없다)
        print("  ❌ 가이드에 적힌 테스트 파일이 없다:")
        for e in result.get("errors", []):
            print(f"       {e}")
        print("     → 파일을 만들거나 _GUIDE.md '## 하네스' 목록에서 지운다")
    else:
        icon = "✅" if result["status"] == "pass" else "❌"
        print(f"  {icon} {result['passed']} passed / {result['failed']} failed")
        if result.get("missing"):
            print(f"     ⚠️  목록에 있으나 없는 파일: {', '.join(result['missing'])}")
        if result["status"] != "pass":
            print("\n".join("     " + ln for ln in result.get("output", "").splitlines()[-25:]))

    if diff and (p := cache_path(folder_key)).exists():
        print_diff(json.loads(p.read_text()), result)
    cache_path(folder_key).write_text(json.dumps(
        {"ts": datetime.now().isoformat(), "status": result["status"],
         "passed": result["passed"], "failed": result["failed"],
         "failed_names": result.get("failed_names", [])}, ensure_ascii=False))

    ok = result["status"] in ("pass", "no_tests")
    if gc:
        findings = run_gc(folder_key, guide)
        print(f"\n  GC: {len(findings)}건")
        for x in findings:
            print(f"    ⚠️  [{x['type']}] {x.get('file','')} {x['message']}")
        if any(x["type"] in ("forbidden_pattern", "missing_guide") for x in findings):
            ok = False
    return ok


def all_folders() -> list[str]:
    """meta.folder_guides 우선, 없으면 _GUIDE.md 가 있는 폴더 전부."""
    if fg := META.get("folder_guides"):
        return sorted(fg.keys())
    return sorted(str(g.parent.relative_to(ROOT))
                  for g in ROOT.glob(f"**/{CFG['guide_filename']}")
                  if not any(s in g.parts for s in CFG["skip_dirs"] + ["templates"]))


def collect_score(target: str = "all", with_gc: bool = True) -> dict:
    """루프가 읽는 점수 벡터. 사람용 출력 없이 숫자만 낸다.

    전부 **작을수록 좋음**. 테스트 개수(collected)만 예외로, 점수 해킹 감시용이다
    (테스트를 지워서 failed 를 줄이는 수법 — loop.py 가 이 값으로 잡는다).
    """
    targets = all_folders() if target == "all" else [target]
    passed = failed = gc_n = 0
    for folder_key in targets:
        guide = guide_for(Path(folder_key))
        r = run_tests(get_tests(folder_key, guide), runner_for(folder_key))
        passed += r["passed"]
        failed += r["failed"]
        if with_gc:
            gc_n += sum(1 for f in run_gc(folder_key, guide)
                        if f["type"] in ("forbidden_pattern", "missing_guide"))
    if target == "all":
        for extra in CFG["always_run"]:
            if (ROOT / extra).exists():
                r = run_tests([extra])
                passed += r["passed"]
                failed += r["failed"]
    lint = run_doc_lint() if target == "all" else []
    return {
        "failed": failed,
        "lint_fail": sum(1 for x in lint if x["level"] == "FAIL"),
        "lint_warn": sum(1 for x in lint if x["level"] == "WARN"),
        "gc": gc_n,
        "passed": passed,
        "collected": passed + failed,          # ← 점수 해킹 감시 기준
        "test_files": len({t for k in targets
                           for t in get_tests(k, guide_for(Path(k)))}),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("target", help="폴더 / 파일 / 'all'")
    ap.add_argument("--json", action="store_true",
                    help="점수 벡터만 JSON 으로 출력 (loop.py 용)")
    ap.add_argument("--gc", action="store_true", help="정적 검사 포함")
    ap.add_argument("--diff", action="store_true", help="직전 실행 대비 변화 표시")
    ap.add_argument("--no-lint", action="store_true", help="all 실행 시 Doc Lint 생략")
    ap.add_argument("--rules", action="store_true",
                    help="규칙 커버리지 리포트 (발화 가능한 규칙이 몇 개인지)")
    args = ap.parse_args()

    if args.rules:
        print_rule_coverage(run_rule_coverage())
        sys.exit(0)

    if args.json:
        print(json.dumps(collect_score(args.target, with_gc=True), ensure_ascii=False))
        sys.exit(0)

    if args.target != "all":
        sys.exit(0 if run_one(args.target, args.gc, args.diff) else 1)

    ok = True
    for folder in all_folders():
        # all 은 gc 를 **항상** 켠다. CLAUDE.md 의 "완료" 정의가
        # `harness all 통과 + 해당 _GUIDE.md 금지사항 위반 없음` 인데, gc 가 옵션이면
        # 두 번째 조건을 기계가 아무도 안 본다. 바로 아래 주석이 2026-08-26 에
        # deps_check 로 똑같은 교훈을 적어 뒀다 —
        # **사람이 따로 쳐야만 도는 검사는 결국 안 도는 검사다.**
        # (적대적 리뷰 M1, 2026-09-02: narrate.py 가 금지 패턴을 어긴 채 통과 중이었다)
        ok &= run_one(folder, True, args.diff)
    for extra in CFG["always_run"]:
        if (ROOT / extra).exists():
            r = run_tests([extra])
            icon = "✅" if r["status"] == "pass" else "❌"
            print(f"\n{'='*46}\n  {extra}: {icon} {r['passed']} passed / {r['failed']} failed")
            ok &= r["status"] in ("pass", "no_tests")
    # 외부 검사 (경계·기능 선언) — 파일이 있을 때만. 사람이 따로 쳐야만 도는 검사는
    # 결국 안 도는 검사다 (2026-08-26: deps_check 가 harness 에 안 물려 있었음)
    for cmd in CFG.get("extra_checks") or []:
        script = ROOT / cmd[0]
        if not script.exists():
            continue
        r = subprocess.run([sys.executable, str(script), *cmd[1:]],
                           cwd=ROOT, capture_output=True, text=True)
        name = Path(cmd[0]).stem
        if r.returncode == 0:
            print(f"\n{'─'*46}\n  {name}: ✅ 통과")
        else:
            ok = False
            print(f"\n{'─'*46}\n  {name}: ❌ 실패")
            print("\n".join("    " + ln for ln in
                            (r.stdout + r.stderr).strip().splitlines()[-15:]))

    if not args.no_lint:
        ok &= print_doc_lint(run_doc_lint())
    print("\n" + ("✅ harness all 통과" if ok else "❌ harness all 실패"))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
