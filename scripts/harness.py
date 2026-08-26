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
    if not META_PATH.exists():
        return {}
    try:
        import yaml
    except ImportError:
        return {}
    try:
        return yaml.safe_load(META_PATH.read_text()) or {}
    except Exception as e:
        print(f"⚠️  meta/project_state.yaml 파싱 실패: {e}")
        return {}


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
    """_GUIDE.md 의 ```gc 펜스 블록에서 (정규식, 메시지) 쌍 파싱.

        ```gc
        pattern: "except Exception:\\s*pass"
        message: "silent failure 금지 — 반드시 로깅"
        ```
    """
    if not guide_path.exists():
        return []
    text = guide_path.read_text()
    blocks = re.findall(r"```gc\s*(.*?)```", text, re.DOTALL)
    if not blocks:
        m = re.search(rf"## {re.escape(CFG['gc_section'])}.*?```(.*?)```", text, re.DOTALL)
        blocks = [m.group(1)] if m else []
    pairs: list[tuple[str, str]] = []
    for block in blocks:
        pats = re.findall(r'pattern:\s*"([^"]+)"', block)
        msgs = re.findall(r'message:\s*"([^"]+)"', block)
        msgs += [""] * (len(pats) - len(msgs))
        pairs.extend(zip(pats, msgs))
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

    for pattern, message in parse_guide_gc(guide_path):
        try:
            rx = re.compile(pattern)
        except re.error as e:
            findings.append({"type": "bad_gc_pattern", "file": str(guide_path.relative_to(ROOT)),
                             "message": f"GC 정규식 오류 {pattern!r}: {e}"})
            continue
        for f in files:
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
        ok &= run_one(folder, args.gc, args.diff)
    for extra in CFG["always_run"]:
        if (ROOT / extra).exists():
            r = run_tests([extra])
            icon = "✅" if r["status"] == "pass" else "❌"
            print(f"\n{'='*46}\n  {extra}: {icon} {r['passed']} passed / {r['failed']} failed")
            ok &= r["status"] in ("pass", "no_tests")
    if not args.no_lint:
        ok &= print_doc_lint(run_doc_lint())
    print("\n" + ("✅ harness all 통과" if ok else "❌ harness all 실패"))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
