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

# 조항 헤딩. 정부 지침은 ASCII 'III' 가 아니라 전각 로마숫자(U+2160~)를 쓴다.
# 깊이가 곧 section_path 의 계층이다.
_LEVELS = (
    # depth 0 — 장(章). 로마숫자만이다.
    re.compile(r"^\s*(?P<label>[\u2160-\u217f]+|[IVX]+)\s*[.)]?\s+\S"),
    # depth 1 — 절: '1.', '2-1.', 그리고 인용 법령 조문 '제79조'.
    # 제N조 를 장으로 잡으면 지침 본문에 인용된 「후계농어업인법」 조문이
    # Ⅱ장·Ⅲ장을 통째로 덮어써서 출처 표기가 거짓이 된다. (실제로 그랬다)
    re.compile(r"^\s*(?P<label>\d+(?:[-.]\d+)*|제\s*\d+\s*조(?:의\s*\d+)?)\s*[.)]?\s+\S"),
    # depth 2 — 항: '가.', '1)', '가)', '①'
    re.compile(r"^\s*(?P<label>[가-힣]\s*[.)]|\d+\)|[가-힣]\)|[\u2460-\u2473])\s*\S"),
)

# 본문 불릿. 헤딩은 아니지만 큰 덩어리를 자를 때 경계로 쓴다.
_BULLET = re.compile(r"^\s*[ㅇ○◦□▪▸·\-*]\s+\S")

# 목차 줄: 'Ⅰ. 사업개요 1' 처럼 끝이 쪽번호다. 검색에 쓸모없고 노이즈만 만든다.
_TOC_LINE = re.compile(r"^\s*\S.{0,60}?\s+\d{1,3}\s*$")

# 한 청크의 목표 상한. 넘으면 불릿 경계에서 쪼갠다.
# 4,000자 청크는 '거치기간'과 '재해 상환연기' 질문에 똑같이 걸려서 둘 다 못 맞춘다.
MAX_CHUNK_CHARS = 900


def _match_heading(line: str) -> tuple[int, str] | None:
    for depth, rx in enumerate(_LEVELS):
        m = rx.match(line)
        if m:
            return depth, m.group("label").strip().rstrip(".)").replace(" ", "")
    return None


def _strip_toc(lines: list[str]) -> list[str]:
    """'목 차' 이후의 쪽번호 목록을 걷어낸다."""
    try:
        start = next(i for i, ln in enumerate(lines[:80]) if re.fullmatch(r"\s*목\s*차\s*", ln))
    except StopIteration:
        return lines
    i = start + 1
    misses = 0
    while i < len(lines) and misses < 3:
        ln = lines[i].strip()
        if not ln or _TOC_LINE.match(ln):
            misses = 0 if ln else misses
        else:
            misses += 1
        i += 1
    return lines[:start] + lines[i - misses:]


def _split_oversized(body: str) -> list[str]:
    """불릿 경계에서 MAX_CHUNK_CHARS 근처로 자른다. 첫 줄(제목)은 각 조각에 붙인다."""
    if len(body) <= MAX_CHUNK_CHARS:
        return [body]
    lines = body.splitlines()
    title = lines[0].strip()
    parts, buf = [], []

    def flush() -> None:
        chunk = "\n".join(buf).strip()
        if chunk:
            parts.append(chunk if chunk.startswith(title) else f"{title}\n{chunk}")
        buf.clear()

    for ln in lines:
        if buf and _BULLET.match(ln) and sum(len(x) for x in buf) >= MAX_CHUNK_CHARS:
            flush()
        buf.append(ln)
    flush()
    return parts or [body]


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
    lines = _strip_toc(lines)

    chunks: list[Chunk] = []
    # (깊이, 라벨) 쌍으로 든다. 리스트 인덱스를 깊이로 쓰면 상위 헤딩이
    # 없는 문서에서 '제3조-제4조' 처럼 형제가 부모-자식으로 붙는다.
    path_stack: list[tuple[int, str]] = []
    buffer: list[str] = []
    current = "머리말"

    def flush() -> None:
        body = "\n".join(buffer).strip()
        buffer.clear()
        if not body:
            return
        for part in _split_oversized(body):
            chunks.append(
                Chunk(
                    chunk_id=f"{path.stem}-{len(chunks) + 1}",
                    doc_title=doc_title,
                    doc_year=doc_year,
                    section_path=current,
                    region=None,
                    source_url=source_url,
                    text=part,
                )
            )

    for line in lines:
        hit = _match_heading(line) if line.strip() else None
        if hit:
            flush()
            depth, label = hit
            path_stack[:] = [e for e in path_stack if e[0] < depth] + [(depth, label)]
            current = "-".join(lbl for _d, lbl in path_stack)
            buffer.append(line.strip())
        else:
            buffer.append(line)
    flush()
    return chunks


def build_index() -> list[Chunk]:
    CORPUS_DIR.mkdir(parents=True, exist_ok=True)
    chunks: list[Chunk] = []
    for path in sorted(CORPUS_DIR.iterdir()):
        if path.name in (INDEX_PATH.name, "README.md"):
            continue  # README 는 사용 설명서지 지침 원문이 아니다
        if path.suffix == ".jsonl":
            chunks += _from_jsonl(path)
        elif path.suffix in (".txt", ".md"):
            chunks += _from_text(path)
    with open(INDEX_PATH, "w", encoding="utf-8") as f:
        for c in chunks:
            f.write(json.dumps(asdict(c), ensure_ascii=False) + "\n")
    return chunks


def load_index() -> list[dict]:
    """색인을 읽는다. 없으면 원문에서 한 번 만든다.

    색인(index.jsonl)은 생성물이라 저장소에 넣지 않는다. 그런데 클론한 사람이
    `python -m rag.ingest` 를 안 돌리면 제도 근거가 **조용히** "근거 없음"이 된다 —
    기능이 없는 것과 설정이 덜 된 것을 화면에서 구분할 수 없다. 그래서 원문이
    있으면 자동으로 만든다. 원문까지 없으면 그때는 진짜 근거가 없는 것이다.
    """
    if not INDEX_PATH.exists():
        if any(CORPUS_DIR.glob("*.txt")) or any(CORPUS_DIR.glob("*.jsonl")):
            import logging
            logging.getLogger(__name__).info(
                "색인이 없어 %s 의 원문에서 새로 만듭니다.", CORPUS_DIR
            )
            build_index()
        else:
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
