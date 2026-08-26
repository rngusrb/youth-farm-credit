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
from pathlib import Path

VIEWPORTS = {"mobile": (390, 844), "tablet": (768, 1024), "desktop": (1280, 800)}

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
  const visible = (el) => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return s.display !== "none" && s.visibility !== "hidden" && parseFloat(s.opacity) > 0.1
           && r.width > 0 && r.height > 0;
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
  const boxes = [];
  for (const el of document.querySelectorAll(INTERACTIVE)) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (el.type !== "hidden" && (r.width < 44 || r.height < 44))
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
  const visible = (el) => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return s.display !== "none" && s.visibility !== "hidden" && parseFloat(s.opacity) > 0.1
           && r.width > 0 && r.height > 0;
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


def run(target: str, viewport: str, settle_ms: int) -> dict:
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
        page = browser.new_page(viewport={"width": w, "height": h})
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
            "content_units": content_units, "violations": violations}


def main() -> int:
    ap = argparse.ArgumentParser(description="UI 규칙 검사 (결정적)")
    ap.add_argument("target", help="URL 또는 HTML 파일 경로")
    ap.add_argument("--viewport", choices=list(VIEWPORTS), default="desktop")
    ap.add_argument("--all-viewports", action="store_true", help="mobile+tablet+desktop 전부")
    ap.add_argument("--count", action="store_true", help="위반 수만 (loop metrics 용)")
    ap.add_argument("--content", action="store_true",
                    help="내용 총량만 (지워서 점수 올리기 감시 — loop guard 용)")
    ap.add_argument("--json", action="store_true", help="상세 JSON")
    ap.add_argument("--settle-ms", type=int, default=300, help="측정 전 대기 (기본 300)")
    a = ap.parse_args()

    views = list(VIEWPORTS) if a.all_viewports else [a.viewport]
    results = [run(a.target, v, a.settle_ms) for v in views]
    total = sum(r["count"] for r in results)

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
    for r in results:
        print(f"\n  [{r['viewport']} {VIEWPORTS[r['viewport']][0]}px]  위반 {r['count']}건")
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
