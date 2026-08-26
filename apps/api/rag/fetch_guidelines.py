"""시행지침 원문 수집 · 평문 변환 CLI (adapters).

한 번만 돌린다. 결과 `data/corpus/*.txt` 는 저장소에 커밋되므로,
클론한 사람은 네트워크도 pdftotext 도 없이 `python -m rag.ingest` 만 하면 된다.
crops.json 을 만드는 stats/calibrate_*.py 와 같은 패턴이다.

    python -m rag.fetch_guidelines            # 전체 수집
    python -m rag.fetch_guidelines --list     # 대상 문서만 출력
"""
from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path

CORPUS_DIR = Path(__file__).resolve().parent.parent / "data" / "corpus"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"


@dataclass(frozen=True)
class Source:
    slug: str
    title: str
    year: int
    url: str
    referer: str
    fmt: str  # "hwpx" | "pdf"


# 명세 §6 대상 문서의 현행판. 구판(2024 선발및지원사업)은 폐지되어 넣지 않는다.
SOURCES = (
    Source(
        slug="successor_2026",
        title="2026년 후계농업경영인 육성사업 시행지침",
        year=2026,
        url="https://agro.seoul.go.kr/files/2026/01/695c974c7e8cc4.98326859.hwpx",
        referer="https://agro.seoul.go.kr/archives/55168",
        fmt="hwpx",
    ),
    Source(
        slug="youth_settlement_2026",
        title="2026년 청년농업인(청년창업형 후계농업경영인) 영농정착지원사업 시행지침",
        year=2026,
        url="https://agro.seoul.go.kr/files/2025/11/690d729717ebd6.55354870.hwpx",
        referer="https://agro.seoul.go.kr/archives/54938",
        fmt="hwpx",
    ),
    Source(
        slug="excellent_successor_2026",
        title="2026년 우수후계농업경영인 육성사업 시행지침",
        year=2026,
        url="https://www.mafra.go.kr/bbs/home/791/593060/download.do",
        referer="https://www.mafra.go.kr/",
        fmt="pdf",
    ),
)

_TAG = re.compile(r"<[^>]+>")
_HP_T = re.compile(r"<hp:t[^>]*>(.*?)</hp:t>", re.S)
_ENTITY = {"&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&apos;": "'"}


def _download(src: Source) -> bytes:
    req = urllib.request.Request(src.url, headers={"User-Agent": UA, "Referer": src.referer})
    with urllib.request.urlopen(req, timeout=90) as r:  # noqa: S310 — 고정 화이트리스트 URL
        data = r.read()
    if not data:
        raise RuntimeError(f"{src.slug}: 빈 응답 (기관 사이트가 세션을 요구할 수 있다)")
    return data


def _unescape(s: str) -> str:
    for k, v in _ENTITY.items():
        s = s.replace(k, v)
    return s


def _from_hwpx(blob: bytes) -> str:
    """HWPX 는 zip+XML 이다. 문단(<hp:p>) 단위로 텍스트 런(<hp:t>)을 잇는다."""
    with zipfile.ZipFile(__import__("io").BytesIO(blob)) as z:
        sections = sorted(n for n in z.namelist() if re.search(r"section\d+\.xml$", n))
        if not sections:
            raise RuntimeError("HWPX 안에 Contents/section*.xml 이 없다")
        lines: list[str] = []
        for name in sections:
            xml = z.read(name).decode("utf-8", "ignore")
            for para in xml.split("</hp:p>"):
                text = _TAG.sub("", "".join(_HP_T.findall(para))).strip()
                if text:
                    lines.append(_unescape(text))
    return "\n".join(lines)


def _from_pdf(blob: bytes) -> str:
    """pdftotext -layout 에 의존한다. 없으면 명확히 실패시킨다(조용한 실패 금지)."""
    if not shutil.which("pdftotext"):
        raise RuntimeError(
            "pdftotext 가 없다. `brew install poppler` 후 다시 실행하거나, "
            "이 문서를 SOURCES 에서 빼라."
        )
    with tempfile.TemporaryDirectory() as d:
        pdf, txt = Path(d) / "in.pdf", Path(d) / "out.txt"
        pdf.write_bytes(blob)
        subprocess.run(["pdftotext", "-layout", str(pdf), str(txt)], check=True)  # noqa: S603
        raw = txt.read_text(encoding="utf-8", errors="ignore")
    # 목차의 점 리더('·  ·  ·')가 줄마다 흩어져 나온다. 점만 있는 줄은 버린다.
    keep = [ln.rstrip() for ln in raw.splitlines() if ln.strip().strip("·.…") or not ln.strip()]
    return "\n".join(keep)


def fetch_one(src: Source) -> Path:
    blob = _download(src)
    body = _from_hwpx(blob) if src.fmt == "hwpx" else _from_pdf(blob)
    if len(body) < 5000:
        raise RuntimeError(f"{src.slug}: 추출 텍스트가 {len(body)}자뿐이다 — 파싱 실패로 본다")
    CORPUS_DIR.mkdir(parents=True, exist_ok=True)
    out = CORPUS_DIR / f"{src.slug}.txt"
    header = f"# {src.title} | {src.year} | {src.url}"
    out.write_text(f"{header}\n{body}\n", encoding="utf-8")
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="시행지침 원문 수집")
    ap.add_argument("--list", action="store_true", help="대상 문서만 출력")
    ap.add_argument("--only", help="slug 하나만 수집")
    args = ap.parse_args(argv)

    if args.list:
        for s in SOURCES:
            print(f"  {s.slug:26} {s.fmt:5} {s.title}")
        return 0

    targets = [s for s in SOURCES if not args.only or s.slug == args.only]
    if not targets:
        print(f"slug '{args.only}' 없음", file=sys.stderr)
        return 1

    failed = 0
    for s in targets:
        try:
            p = fetch_one(s)
            print(f"  ✅ {s.slug:26} {len(p.read_text(encoding='utf-8')):>7,}자  → {p.name}")
        except Exception as e:  # 실패를 삼키지 않는다
            failed += 1
            print(f"  ❌ {s.slug:26} {e}", file=sys.stderr)
    if failed:
        print(f"\n{failed}건 실패", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
