#!/usr/bin/env python3
"""
scripts/ui_check.py — UI 규칙 검사 (결정적)

**재는 것만 한다. 취향은 판정하지 않는다.**
"세련됐나", "색 조합이 좋나" 는 물어볼 때마다 답이 달라서, 그걸로 루프를 돌리면
개선이 아니라 표류가 된다. 모델은 흔들림을 신호로 착각하고 계속 고친다.

여기 있는 8종은 전부 자·저울로 재는 것이라 **같은 화면이면 항상 같은 점수**가 나온다.
그래서 loop.py 의 지표로 안전하게 쓸 수 있다.

    python scripts/ui_check.py http://localhost:8000        # 위반 목록
    python scripts/ui_check.py http://localhost:8000 --count  # 위반 수 (loop metrics)
    python scripts/ui_check.py page.html --viewport mobile    # 모바일로
    python scripts/ui_check.py http://localhost:8000 --json   # 상세 JSON

결정성을 위해: 애니메이션·트랜지션을 끄고, 네트워크가 잠잠해질 때까지 기다린 뒤 잰다.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

VIEWPORTS = {"mobile": (390, 844), "tablet": (768, 1024), "desktop": (1280, 800)}

# 실행 사실을 남긴다. 서버가 떠 있어야 해서 커밋 훅에 못 넣지만,
# **안 돌렸다는 사실**은 harness 가 자동으로 잡을 수 있다 (ui_check_stale).
RECORD = ROOT / ".harness_cache" / "ui_check.json"


def write_record(results: list[dict]) -> None:
    RECORD.parent.mkdir(parents=True, exist_ok=True)
    RECORD.write_text(json.dumps({
        "ts": time.time(),
        "targets": sorted({r["target"] for r in results}),
        "viewports": sorted({r["viewport"] for r in results}),
        "total": sum(r["count"] for r in results),
    }, ensure_ascii=False, indent=2))

# ── 로그인 뒤 화면 (meta/project_state.yaml 의 ui_check.sessions / targets) ──
#
# 왜 필요한가: 세션을 못 심어서 로그인 뒤 화면을 **한 번도 검사한 적이 없었다.**
# /bank, /bank/capacity, /bank/design 이 전부 로그인 게이트만 재고 있었고
# (세 화면 모두 '내용 101단위' 로 동일하게 나온 것이 증거), 그 뒤에서 모바일 업무 탭이
# 35×44 로 WCAG 2.5.5 를 어기고 있었다. 아무도 몰랐다.
#
# 여기 들어가는 것은 **데모 계정뿐**이다. 실제 인증이 붙으면 이 방식은 폐기한다.
META_PATH = ROOT / "meta" / "project_state.yaml"


def load_ui_config() -> dict:
    """meta 의 ui_check 블록. 못 읽으면 죽는다 — 설정 없이 돌면 '0건 통과' 가 나온다."""
    if not META_PATH.exists():
        return {}
    try:
        import yaml
    except ImportError:
        sys.exit("❌ PyYAML 이 없어 meta/project_state.yaml 을 읽을 수 없다.\n"
                 "   python3 -m pip install pyyaml")
    try:
        meta = yaml.safe_load(META_PATH.read_text()) or {}
    except Exception as e:
        sys.exit(f"❌ meta/project_state.yaml 파싱 실패: {e}")
    return meta.get("ui_check") or {}


def session_script(session: dict) -> str:
    """localStorage 를 심는 init script. 페이지가 뜨기 전에 들어가야 한다."""
    lines = []
    for key, value in (session or {}).items():
        raw = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
        lines.append(f"window.localStorage.setItem({json.dumps(key)}, {json.dumps(raw)});")
    return "".join(lines)


# 규칙 정의 — 숫자의 출처를 같이 적는다. 근거 없는 커트라인을 쌓지 않기 위해서다.
RULES = {
    "contrast":      "본문 대비율 ≥ 4.5:1 (WCAG 2.1 AA, 큰 글씨는 3:1)",
    "touch_target":  "터치 대상 ≥ 44×44px (WCAG 2.5.5 / Apple HIG)",
    "overlap":       "상호작용 요소끼리 겹침 없음",
    "h_scroll":      "가로 스크롤 없음 (반응형 깨짐 신호)",
    "img_alt":       "이미지에 alt 존재 (장식용은 alt=\"\")",
    "tiny_font":     "본문 글씨 ≥ 12px",
    "console_error": "콘솔 에러 0",
    "failed_request": "실패한 네트워크 요청 0",
}

# 페이지 안에서 도는 검사기. 브라우저가 이미 계산한 값(getComputedStyle,
# getBoundingClientRect)만 읽으므로 결정적이다.
PROBE = r"""
() => {
  const out = [];
  const sel = (el) => {
    if (el.id) return `#${el.id}`;
    const cls = (el.className || "").toString().trim().split(/\s+/).filter(Boolean)[0];
    return el.tagName.toLowerCase() + (cls ? `.${cls}` : "");
  };
  const parseColor = (c) => {
    const m = (c || "").match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(",").map(x => parseFloat(x.trim()));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = ({r, g, b}) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const bgOf = (el) => {                      // 투명이면 조상으로 거슬러 올라간다
    let n = el;
    while (n && n !== document.documentElement) {
      const c = parseColor(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.5) return c;
      n = n.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  // 접힌 <details> 안은 **보이지 않는다**. 엔진에 따라 rect 가 남아 있어서
  // 그대로 재면 없는 겹침을 만들고, 접어서 줄인 정보량이 줄지 않은 것처럼 나온다.
  // (2026-08-27 실측: Fold 적용 후 리포트에서 겹침 3건이 유령으로 잡혔다)
  const inClosedFold = (el) => {
    const d = el.closest("details:not([open])");
    if (!d) return false;
    const sm = d.querySelector(":scope > summary");
    return !(sm && (sm === el || sm.contains(el)));
  };
  const visible = (el) => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return s.display !== "none" && s.visibility !== "hidden" && parseFloat(s.opacity) > 0.1
           && r.width > 0 && r.height > 0 && !inClosedFold(el);
  };
  const hasText = (el) =>
    Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 0);

  // 1. 대비율 + 6. 폰트 크기
  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el) || !hasText(el)) continue;
    const s = getComputedStyle(el);
    const size = parseFloat(s.fontSize);
    const weight = parseInt(s.fontWeight) || 400;
    if (size < 12) out.push({ rule: "tiny_font", where: sel(el),
                              detail: `${size.toFixed(1)}px < 12px` });
    const fg = parseColor(s.color), bg = bgOf(el);
    if (!fg || fg.a < 0.5) continue;
    const L1 = lum(fg), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3.0 : 4.5;
    if (ratio < need)
      out.push({ rule: "contrast", where: sel(el),
                 detail: `${ratio.toFixed(2)}:1 < ${need}:1 (${size.toFixed(0)}px)` });
  }

  // 2. 터치 대상 + 3. 겹침
  const INTERACTIVE = "a,button,input,select,textarea,[role=button],[onclick]";
  // 포커스 전까지 보이지 않는 요소(스킵 링크 등)는 **터치 대상이 아니다.**
  // .sr-only 패턴은 1px 로 접어 두었다가 :focus 에서 펼친다 — 44px 을 요구하면
  // 매 실행 54건(대상 18 × 뷰포트 3)의 잡음이 나와 진짜 위반이 묻힌다.
  // 판정 기준은 클래스 이름이 아니라 **실제 계산된 스타일**이다.
  const focusOnly = (el) => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    const clipped = s.clip !== "auto" || s.clipPath !== "none" || s.overflow === "hidden";
    return r.width <= 2 && r.height <= 2 && clipped && s.position === "absolute";
  };
  // WCAG 2.5.5/2.5.8 의 **Inline 예외**: "대상이 문장 안에 있거나, 크기가 주변
  // 본문의 행간에 묶여 있는 경우" 는 44×44 를 요구하지 않는다.
  // 2026-09-02 이 예외가 없어서 "…<a>수익 전망</a>에서 볼 수 있어요" 같은 문장 속
  // 링크가 전부 위반으로 잡혔다. 그걸 통과시키려면 문장을 비틀어야 하는데, 그건
  // 규격이 요구하지도 않는 일이다. **검사를 규격에 맞춘다.**
  //   조건 두 개를 모두 만족해야 한다 —
  //   ① 계산된 display 가 inline (블록으로 만든 버튼·카드는 예외가 아니다)
  //   ② 부모가 이 대상 말고도 실제 글자를 갖고 있다 (= 문장 안이다)
  const inlineInSentence = (el) => {
    if (getComputedStyle(el).display !== "inline") return false;
    const p = el.parentElement;
    if (!p) return false;
    return Array.from(p.childNodes).some(
      (n) => n.nodeType === 3 && n.textContent.trim().length > 0);
  };
  const boxes = [];
  for (const el of document.querySelectorAll(INTERACTIVE)) {
    if (!visible(el) || focusOnly(el)) continue;
    const r = el.getBoundingClientRect();
    if (el.type !== "hidden" && (r.width < 44 || r.height < 44) && !inlineInSentence(el))
      out.push({ rule: "touch_target", where: sel(el),
                 detail: `${Math.round(r.width)}×${Math.round(r.height)} < 44×44` });
    boxes.push({ el, r });
  }
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (ox > 1 && oy > 1)
        out.push({ rule: "overlap", where: `${sel(a.el)} ↔ ${sel(b.el)}`,
                   detail: `${Math.round(ox)}×${Math.round(oy)}px 겹침` });
    }

  // 4. 가로 스크롤
  const over = document.documentElement.scrollWidth - window.innerWidth;
  if (over > 1) {
    let culprit = "";
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth + 1) { culprit = sel(el); break; }
    }
    out.push({ rule: "h_scroll", where: culprit || "document",
               detail: `${over}px 넘침 (뷰포트 ${window.innerWidth}px)` });
  }

  // 5. alt
  for (const img of document.querySelectorAll("img")) {
    if (!visible(img)) continue;
    if (img.getAttribute("alt") === null)
      out.push({ rule: "img_alt", where: sel(img),
                 detail: (img.getAttribute("src") || "").slice(-40) });
  }
  return out;
}
"""

# 내용 총량 — "지워서 점수 올리기" 감시용. 요소를 지우면 반드시 줄어든다.
CENSUS = r"""
() => {
  // 접힌 <details> 안은 **보이지 않는다**. 엔진에 따라 rect 가 남아 있어서
  // 그대로 재면 없는 겹침을 만들고, 접어서 줄인 정보량이 줄지 않은 것처럼 나온다.
  // (2026-08-27 실측: Fold 적용 후 리포트에서 겹침 3건이 유령으로 잡혔다)
  const inClosedFold = (el) => {
    const d = el.closest("details:not([open])");
    if (!d) return false;
    const sm = d.querySelector(":scope > summary");
    return !(sm && (sm === el || sm.contains(el)));
  };
  const visible = (el) => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return s.display !== "none" && s.visibility !== "hidden" && parseFloat(s.opacity) > 0.1
           && r.width > 0 && r.height > 0 && !inClosedFold(el);
  };
  const hasText = (el) =>
    Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 0);
  let units = 0;
  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el)) continue;
    if (hasText(el)) units++;
    if (el.matches("a,button,input,select,textarea,[role=button],img")) units++;
  }
  return units;
}
"""


def run(target: str, viewport: str, settle_ms: int, session: dict | None = None) -> dict:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("❌ playwright 없음:  pip install playwright && python -m playwright install chromium",
              file=sys.stderr)
        sys.exit(2)

    url = target
    if not target.startswith(("http://", "https://")):
        p = Path(target).resolve()
        if not p.exists():
            print(f"❌ 파일 없음: {target}", file=sys.stderr)
            sys.exit(2)
        url = p.as_uri()

    w, h = VIEWPORTS[viewport]
    console_errors: list[str] = []
    failed: list[str] = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        ctx = browser.new_context(viewport={"width": w, "height": h})
        if session:
            # 페이지가 뜨기 전에 심어야 한다 — 뜬 뒤에 넣으면 게이트가 이미 튕긴 뒤다.
            ctx.add_init_script(session_script(session))
        page = ctx.new_page()
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(str(e)))
        page.on("requestfailed",
                lambda r: failed.append(f"{r.method} {r.url[:80]} — {r.failure}"))
        page.on("response",
                lambda r: failed.append(f"{r.status} {r.url[:80]}") if r.status >= 400 else None)

        page.goto(url, wait_until="networkidle")
        # 결정성 확보 — 애니메이션/트랜지션 정지 후 측정
        page.add_style_tag(content="*,*::before,*::after{animation:none!important;"
                                   "transition:none!important;caret-color:transparent!important}")
        page.wait_for_timeout(settle_ms)
        violations = page.evaluate(PROBE)
        content_units = page.evaluate(CENSUS)
        browser.close()

    violations += [{"rule": "console_error", "where": "console", "detail": e[:160]}
                   for e in console_errors]
    violations += [{"rule": "failed_request", "where": "network", "detail": f[:160]}
                   for f in failed]
    return {"target": target, "viewport": viewport, "count": len(violations),
            "content_units": content_units, "violations": violations,
            "session": bool(session)}


def main() -> int:
    ap = argparse.ArgumentParser(description="UI 규칙 검사 (결정적)")
    ap.add_argument("target",
                    help="URL·HTML 파일 경로, 또는 'all' (meta 의 ui_check.targets 전부)")
    ap.add_argument("--as", dest="as_role", default=None,
                    help="이 역할의 세션을 심고 검사 (meta 의 ui_check.sessions 키)")
    ap.add_argument("--viewport", choices=list(VIEWPORTS), default="desktop")
    ap.add_argument("--all-viewports", action="store_true", help="mobile+tablet+desktop 전부")
    ap.add_argument("--count", action="store_true", help="위반 수만 (loop metrics 용)")
    ap.add_argument("--content", action="store_true",
                    help="내용 총량만 (지워서 점수 올리기 감시 — loop guard 용)")
    ap.add_argument("--json", action="store_true", help="상세 JSON")
    ap.add_argument("--settle-ms", type=int, default=300, help="측정 전 대기 (기본 300)")
    a = ap.parse_args()

    views = list(VIEWPORTS) if a.all_viewports else [a.viewport]
    cfg = load_ui_config()
    sessions = cfg.get("sessions") or {}

    def session_for(role: str | None) -> dict | None:
        if not role:
            return None
        if role not in sessions:
            sys.exit(f"❌ meta 의 ui_check.sessions 에 '{role}' 이 없다. "
                     f"있는 것: {sorted(sessions) or '없음'}")
        return sessions[role]

    if a.target == "all":
        targets = cfg.get("targets") or []
        if not targets:
            sys.exit("❌ meta 의 ui_check.targets 가 비어 있다 — 검사할 대상이 없다.\n"
                     "   대상 없이 '0건 통과' 를 내지 않는다.")
        base = (cfg.get("base_url") or "http://localhost:3000").rstrip("/")
        jobs = [(base + t["path"], session_for(t.get("as"))) for t in targets]
    else:
        jobs = [(a.target, session_for(a.as_role))]

    results = [run(url, v, a.settle_ms, sess) for url, sess in jobs for v in views]
    total = sum(r["count"] for r in results)
    write_record(results)          # 돌렸다는 사실을 남긴다

    if a.content:
        print(min(r["content_units"] for r in results))
        return 0
    if a.count:
        print(total)
        return 0
    if a.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
        return 0 if total == 0 else 1

    print(f"\n{'─'*58}\n  UI 검사: {a.target}")
    last_target = None
    for r in results:
        if r["target"] != last_target:
            last_target = r["target"]
            if a.target == "all":
                mark = " (로그인)" if r["session"] else ""
                print(f"\n  ── {r['target']}{mark}")
        print(f"\n  [{r['viewport']} {VIEWPORTS[r['viewport']][0]}px]  위반 {r['count']}건"
              f"  · 내용 {r['content_units']}단위")
        by_rule: dict[str, list[dict]] = {}
        for v in r["violations"]:
            by_rule.setdefault(v["rule"], []).append(v)
        for rule, items in sorted(by_rule.items(), key=lambda kv: -len(kv[1])):
            print(f"    ❌ {rule} ({len(items)}건) — {RULES.get(rule, '')}")
            for v in items[:5]:
                print(f"       {v['where']}  {v['detail']}")
            if len(items) > 5:
                print(f"       … 외 {len(items) - 5}건")
    print(f"\n  총 {total}건" + ("  ✅ 통과" if total == 0 else "")
          + f"   (내용 총량 {min(r['content_units'] for r in results)}단위)")
    return 0 if total == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
