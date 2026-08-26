"""KOSIS 농산물소득조사에 있는 작목을 crops.json 으로 확장한다.

    python -m stats.expand_crops --dry-run
    python -m stats.expand_crops

명세에 적힌 6종만 손으로 넣어 뒀는데, 같은 통계에 44종이 더 있다. 소득 수준과
변동성이 모두 같은 자료에서 나오므로, 손으로 옮길 이유가 없다.

**과수는 제외한다** — 명세 §11 이 축산·과수를 범위 밖으로 못박았다. 다년생이라
식재 후 수년간 소득이 없고, 그 구조는 지금 엔진이 다루지 못한다.

기존 6종은 id·이름·별칭·KAMIS 매핑을 그대로 지킨다(골든 테스트와 명세 호환).
새로 붙는 작목은 이름에서 별칭을 만들고, KAMIS 품목코드는 코드표와 이름을 맞춰
찾되 못 찾으면 비워 둔다 — 없는 매핑을 지어내면 엉뚱한 시세를 가져온다.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass

import numpy as np

from engine.params import DATA_DIR
from stats.env import load as load_env
from stats.kamis import codes
from stats.kosis import fetch_group, series_for
from estimators.volatility import log_returns

CROPS_PATH = DATA_DIR / "crops.json"
MIN_YEARS = 5

# 명세 §11: 축산·과수 범위 밖. 다년생 작목은 식재 후 무수익 기간이 있어
# '면적 → 매년 같은 소득' 이라는 엔진 전제가 성립하지 않는다.
EXCLUDED_GROUPS = ("과수",)
GROUPS = ("시설채소", "노지채소", "식량특용", "화훼")

PREFIX = ("시설", "노지")
# 작형·연차 표기. 별칭을 만들 때 떼어낸다.
FORM = re.compile(r"\((촉성|반촉성|억제|수경|토경|\d+년근)\)")


@dataclass
class Candidate:
    crop_id: str
    name: str
    kosis_name: str
    group: str
    income: float
    income_year: int
    n: int
    aliases: list[str]
    series_name: str = ""


def slugify(name: str) -> str:
    """작목명 → 안정적인 id. 한글은 그대로 두면 URL·JSON 키로 쓰기 나쁘다.

    유니코드 정규화는 하지 않는다 — NFKD 는 한글을 자모로 분해해 버려서
    아래 사전이 하나도 걸리지 않는다.
    """
    base = name
    table = {
        "시설": "greenhouse", "노지": "field", "촉성": "early", "반촉성": "semi",
        "억제": "late", "수경": "hydro", "토경": "soil",
        "딸기": "strawberry", "토마토": "tomato", "방울토마토": "cherrytomato",
        "오이": "cucumber", "가지": "eggplant", "시금치": "spinach", "상추": "lettuce",
        "부추": "chive", "호박": "squash", "참외": "koreanmelon", "멜론": "melon",
        "수박": "watermelon", "고추": "pepper", "파프리카": "paprika",
        "착색단고추": "paprika", "장미": "rose", "국화": "chrysanthemum",
        "배추": "napacabbage", "무": "radish", "당근": "carrot", "대파": "greenonion",
        "쪽파": "scallion", "생강": "ginger", "양배추": "cabbage",
        "고랭지": "highland", "가을": "autumn", "봄": "spring",
        "감자": "potato", "고구마": "sweetpotato", "인삼": "ginseng",
        "참깨": "sesame", "들깨": "perilla", "겉보리": "barley",
        "쌀보리": "naked-barley", "맥주보리": "malt-barley", "밀": "wheat",
        "엽연초": "tobacco", "풋옥수수": "sweetcorn", "옥수수": "corn",
        "인삼": "ginseng", "년근": "yr", "국화": "chrysanthemum", "멜론": "melon",
        "블루베리": "blueberry",
    }
    s = re.sub(r"[()]", " ", base)
    for k in sorted(table, key=len, reverse=True):
        s = s.replace(k, f" {table[k]} ")
    s = re.sub(r"[^a-zA-Z0-9]+", "_", s).strip("_").lower()
    # 사전에 없는 글자가 남았으면 id 를 만들지 않는다 — 뜻 모를 id 보다 낫다.
    return s if s and not re.search(r"[가-힣]", s) else ""


def make_aliases(kosis_name: str) -> list[str]:
    """KOSIS 표기에서 사람들이 실제로 칠 법한 이름을 뽑는다."""
    out = [kosis_name]
    bare = FORM.sub("", kosis_name).strip()
    if bare != kosis_name:
        out.append(bare)
    for p in PREFIX:
        if bare.startswith(p):
            short = bare[len(p):]
            if len(short) >= 2:
                out.append(short)
    return list(dict.fromkeys(out))


def find_kamis(kosis_name: str) -> dict | None:
    """코드표에서 같은 품목을 찾는다. 확실하지 않으면 매핑하지 않는다."""
    table = codes()
    bare = FORM.sub("", kosis_name).strip()
    for p in PREFIX:
        if bare.startswith(p):
            bare = bare[len(p):]
    exact = [i for i in table["item"] if i["name"] == bare]
    if len(exact) != 1:
        return None
    item = exact[0]
    varieties = [v for v in table["vrty"]
                 if v["ctgry_cd"] == item["ctgry_cd"] and v["item_cd"] == item["code"]]
    return {
        "se_cd": "02",
        "ctgry_cd": item["ctgry_cd"],
        "item_cd": item["code"],
        "vrty_cd": varieties[0]["code"] if len(varieties) == 1 else None,
        "grd_cd": "04",
        "note": None,
        "available": True,
    }


def collect(rows) -> list[Candidate]:
    """최신 연도에 실제로 조사된 작목만 담는다.

    구표에만 있는 계열(예: 시설오이(촉성), 2022년 종료)의 소득을 '현재 소득'으로
    쓰면 몇 해 지난 값을 최신인 척 보여주게 된다. 소득은 최신 연도 기준으로 잡고,
    σ 를 잴 장기 계열은 따로 고른다 — 자기 계열이 짧으면 같은 품목의 긴 계열에서.
    """
    by_crop = {c: series_for(rows, c, "income")
               for c in sorted({r.crop_name for r in rows if r.crop_name})}
    by_crop = {c: s for c, s in by_crop.items() if s}
    if not by_crop:
        return []
    latest_year = max(s[-1][0] for s in by_crop.values())

    def bare(name: str) -> str:
        n = FORM.sub("", name).strip()
        for p in PREFIX:
            if n.startswith(p):
                n = n[len(p):]
        return n

    out: list[Candidate] = []
    for name, series in by_crop.items():
        year, income = series[-1]
        if year < latest_year or income <= 0:
            continue                      # 단종된 계열은 소득 기준으로 삼지 않는다

        # σ 를 잴 계열: 자기 것이 충분히 길면 자기 것, 아니면 같은 품목의 최장 계열
        candidates = [(n, s) for n, s in by_crop.items() if bare(n) == bare(name)]
        series_name, best = max(candidates, key=lambda kv: (len(kv[1]), kv[0]))
        if len(best) < MIN_YEARS:
            continue

        crop_id = slugify(name)
        if not crop_id:
            continue
        out.append(Candidate(
            crop_id=crop_id,
            name=name,
            kosis_name=name,
            group="",
            income=float(income),
            income_year=int(year),
            n=len(best),
            aliases=make_aliases(name),
            series_name=series_name,
        ))
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="KOSIS 작목으로 crops.json 확장")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)
    load_env()

    data = json.loads(CROPS_PATH.read_text(encoding="utf-8"))
    existing = {c["id"]: c for c in data["crops"]}
    taken_kosis = {c["kosis"]["series_name"] for c in data["crops"] if c.get("kosis")}
    taken_kosis |= {c["kosis"]["name"] for c in data["crops"] if c.get("kosis")}

    added: list[Candidate] = []
    for group in GROUPS:
        print(f"수집  {group} …", file=sys.stderr)
        rows = fetch_group(group)
        for cand in collect(rows):
            if cand.kosis_name in taken_kosis:
                continue          # 명세에 손으로 넣은 6종은 건드리지 않는다
            cand.group = group
            added.append(cand)

    print(f"\n기존 {len(existing)}종 유지 · 신규 {len(added)}종\n", file=sys.stderr)
    head = f"{'id':<26}{'작목':<22}{'군':<8}{'n':>3}{'소득년':>7}{'소득(원/10a)':>15} KAMIS"
    print(head, file=sys.stderr)
    print("─" * len(head), file=sys.stderr)
    for c in added:
        kamis = find_kamis(c.kosis_name)
        print(f"{c.crop_id:<26}{c.name:<22}{c.group:<8}{c.n:>3}{c.income_year:>7}"
              f"{c.income:>15,.0f} {'○' if kamis else '—'}  "
              f"{c.series_name if c.series_name != c.kosis_name else ''}", file=sys.stderr)

    if args.dry_run:
        print("\n--dry-run: crops.json 을 수정하지 않았습니다.", file=sys.stderr)
        return 0

    for c in added:
        data["crops"].append({
            "id": c.crop_id,
            "name": c.name,
            "aliases": c.aliases,
            "income_per_10a": round(c.income),
            "income_year": c.income_year,
            "gross_per_10a": None,
            "cost_per_10a": None,
            "sigma": 0.20,
            "sigma_source": "ASSUMED",
            "harvest_months": [],
            "kamis": find_kamis(c.kosis_name),
            "kosis": {
                "group": c.group,
                "name": c.kosis_name,
                "series_name": c.series_name or c.kosis_name,
                "ratio_base": c.series_name or c.kosis_name,
                "note": None,
            },
        })
    CROPS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\n{CROPS_PATH.name}: {len(data['crops'])}종. "
          f"이어서 `python -m stats.calibrate_kosis` 로 σ 를 채우세요.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
