"""진단이 각 값의 **기준 시점**을 함께 낸다 (UX-009).

왜 있나: 리포트 표지에 발행일(오늘)만 찍혀 있으면 읽는 사람은 숫자도 오늘 것이라
읽는다. 실제로는 소득조사 2023/2024년, 경영비 2022/2024년, σ 계열 2013~2024년으로
서로 다르다. 화면이 `new Date()` 로 채우지 못하게 엔진이 내려준다.
"""
import json
import pathlib

from engine.diagnose import DiagnoseInput, diagnose
from engine.params import crops

CROPS_JSON = pathlib.Path(__file__).resolve().parent.parent / "data" / "crops.json"


def test_모든_작목에_소득조사연도가_있다():
    missing = [c.id for c in crops().values() if not c.income_year]
    assert not missing, f"조사연도 없는 작목: {missing}"


def test_상단_source_라벨이_특정연도를_박지_않는다():
    """작목마다 조사연도가 다르므로 한 줄로 '2023년' 이라 못 박으면 32작목이 거짓이 된다."""
    d = json.loads(CROPS_JSON.read_text(encoding="utf-8"))
    years = {c.get("income_year") for c in d["crops"] if c.get("income_year")}
    assert len(years) > 1, "연도가 하나뿐이면 이 테스트의 전제가 바뀐 것이다 — 라벨을 다시 보라"
    for y in years:
        assert str(y) not in d["source"], (
            f"source 라벨에 {y} 가 박혀 있다. 조사연도 {sorted(years)} 가 섞여 있어 "
            "하나로 못 박을 수 없다."
        )


def test_진단이_기준시점을_낸다():
    d = diagnose(DiagnoseInput(crop_id="strawberry_hydro", pyeong=1200, living_cost=30_000_000))
    a = d["as_of"]
    assert a["income_survey_year"] == 2023
    assert a["sigma_series"] == "2013~2024"
    assert len(a["market_window"]) == 2


def test_없는_시점은_넣지_않는다():
    """모르는 것을 오늘로 채우면 거짓이 된다 — 키 자체를 뺀다."""
    from engine.diagnose import _as_of

    class Bare:
        income_year = None
        cashflow_year = None
        sigma_reference = None
        market = None

    a = _as_of(Bare())
    assert "income_survey_year" not in a
    assert "cost_survey_year" not in a
    assert "sigma_series" not in a
    assert "market_window" not in a
