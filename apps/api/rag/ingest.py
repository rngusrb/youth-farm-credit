"""지침 원문 파싱 · 조항 단위 청킹.

MVP 범위에서 두 가지 입력을 받는다.
  1) data/corpus/*.jsonl — 수작업 정제본 (권장). 표가 많은 HWP 를 자동 파싱하면
     깨지므로 명세 §6 이 허용한 경로다.
  2) data/corpus/*.txt|*.md — 조항 헤딩으로 자동 분할.

출력은 data/corpus/index.jsonl (청크 1건 = 1줄).
"""
from __future__ import annotations

import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

CORPUS_DIR = Path(__file__).resolve().parent.parent / "data" / "corpus"
INDEX_PATH = CORPUS_DIR / "index.jsonl"

REQUIRED_META = ("doc_title", "section_path", "text")

# 'III-2-나', '제12조', '3. 지원대상' 등 조항 헤딩
_HEADING = re.compile(
    r"^\s*(?:"
    r"(?P<roman>[IVXivx]+(?:-\d+)*(?:-[가-힣])?)\s*[.)]?\s+"
    r"|(?P<article>제\s*\d+\s*조(?:의\s*\d+)?)\s*"
    r"|(?P<num>\d+(?:\.\d+)*)\s*[.)]\s+"
    r"|(?P<hangul>[가-힣]\s*[.)]\s+)"
    r")(?P<title>.*)$"
)


@dataclass
class Chunk:
    chunk_id: str
    doc_title: str
    doc_year: int | None
    section_path: str
    region: str | None
    source_url: str | None
    text: str


def _from_jsonl(path: Path) -> list[Chunk]:
    out: list[Chunk] = []
    for i, line in enumerate(path.read_text(encoding="utf-8").splitlines()):
        line = line.strip()
        if not line or line.startswith("//"):
            continue
        rec = json.loads(line)
        missing = [k for k in REQUIRED_META if not rec.get(k)]
        if missing:
            raise ValueError(f"{path.name}:{i + 1} 필수 메타데이터 누락 {missing}")
        out.append(
            Chunk(
                chunk_id=rec.get("chunk_id") or f"{path.stem}-{i + 1}",
                doc_title=rec["doc_title"],
                doc_year=rec.get("doc_year"),
                section_path=rec["section_path"],
                region=rec.get("region"),
                source_url=rec.get("source_url"),
                text=rec["text"].strip(),
            )
        )
    return out


def _from_text(path: Path) -> list[Chunk]:
    """헤딩 경로를 누적해 조항 단위로 자른다.

    첫 줄은 `# 문서제목 | 연도 | URL` 형식의 머리말로 본다(선택).
    """
    lines = path.read_text(encoding="utf-8").splitlines()
    doc_title, doc_year, source_url = path.stem, None, None
    if lines and lines[0].startswith("#"):
        parts = [p.strip() for p in lines[0].lstrip("#").split("|")]
        doc_title = parts[0] or doc_title
        if len(parts) > 1 and parts[1].isdigit():
            doc_year = int(parts[1])
        if len(parts) > 2:
            source_url = parts[2]
        lines = lines[1:]

    chunks: list[Chunk] = []
    path_stack: list[str] = []
    buffer: list[str] = []
    current = "머리말"

    def flush() -> None:
        body = "\n".join(buffer).strip()
        if body:
            chunks.append(
                Chunk(
                    chunk_id=f"{path.stem}-{len(chunks) + 1}",
                    doc_title=doc_title,
                    doc_year=doc_year,
                    section_path=current,
                    region=None,
                    source_url=source_url,
                    text=body,
                )
            )
        buffer.clear()

    for line in lines:
        m = _HEADING.match(line)
        if m and line.strip():
            flush()
            label = (
                m.group("roman") or m.group("article") or m.group("num") or m.group("hangul")
            ).strip().rstrip(".)")
            depth = 0 if m.group("roman") or m.group("article") else 1
            path_stack[:] = path_stack[:depth] + [label]
            current = "-".join(path_stack)
            buffer.append(line.strip())
        else:
            buffer.append(line)
    flush()
    return chunks


def build_index() -> list[Chunk]:
    CORPUS_DIR.mkdir(parents=True, exist_ok=True)
    chunks: list[Chunk] = []
    for path in sorted(CORPUS_DIR.iterdir()):
        if path.name == INDEX_PATH.name:
            continue
        if path.suffix == ".jsonl":
            chunks += _from_jsonl(path)
        elif path.suffix in (".txt", ".md"):
            chunks += _from_text(path)
    with open(INDEX_PATH, "w", encoding="utf-8") as f:
        for c in chunks:
            f.write(json.dumps(asdict(c), ensure_ascii=False) + "\n")
    return chunks


def load_index() -> list[dict]:
    if not INDEX_PATH.exists():
        return []
    return [
        json.loads(line)
        for line in INDEX_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


if __name__ == "__main__":
    built = build_index()
    print(f"{len(built)}개 청크를 {INDEX_PATH} 에 기록했습니다.", file=sys.stderr)
    for c in built[:5]:
        print(f"  [{c.doc_title} {c.section_path}] {c.text[:40]}…", file=sys.stderr)
