"""KOSIS 농산물소득조사 수집 · 영업레버리지 · 분산분해."""
from __future__ import annotations

import math

import pytest

from stats import kosis
from stats.leverage import (
    combine,
    decompose,
    degree_of_operating_leverage,
    implied_idiosyncratic_from_leverage,
    lift_national_average,
)
from stats.volatility import estimate_from_annual_series


def row(year: int, crop: str, item: str, value: float, *, swapped: bool = False) -> dict:
    """KOSIS statisticsParameterData 응답 한 행 (2026-08 실호출로 확인한 구조).

    작목과 비목이 각각 분류축이고, **표마다 두 축의 순서가 다르다.**
    구표 DT_143002_A003 은 C1=작목/C2=비목, 신표 DT_143002_E003 은 그 반대다.
    swapped=True 가 신표 배치다. ITM_NM 은 '금액/수량/비율' 하나뿐이라 쓸모없다.
    """
    base = {
        "PRD_DE": str(year), "PRD_SE": "A", "DT": str(value),
        "ITM_ID": "T001", "ITM_NM": "금액/수량/비율",
        "UNIT_NM": "원", "UNIT_NM_ENG": "WON", "ORG_ID": "143",
    }
    if swapped:
        return {**base, "TBL_ID": "DT_143002_E003", "TBL_NM": "소득분석표_시설채소",
                "C1_OBJ_NM": "비목명별", "C1": "01", "C1_NM": item,
                "C2_OBJ_NM": "시설채소별", "C2": "11", "C2_NM": crop}
    return {**base, "TBL_ID": "DT_143002_A003", "TBL_NM": "소득분석표_시설채소",
            "C1_OBJ_NM": "시설채소별", "C1": "11", "C1_NM": crop,
            "C2_OBJ_NM": "비목명별", "C2": "00", "C2_NM": item}


# ── 응답 처리 ────────────────────────────────────────────────
def test_table_ids_cover_our_crops():
    """딸기·토마토·시금치·가지는 시설채소, 장미는 화훼 표에 있다."""
    assert "시설채소" in kosis.TABLES and "화훼" in kosis.TABLES
    for group, tables in kosis.TABLES.items():
        assert len(tables) == 2, f"{group}: 연도 구간이 둘로 갈려 있어야 한다"


def test_error_arrives_as_http_200_dict(monkeypatch):
    """KOSIS 는 오류도 200 으로 준다. dict 면 오류, list 면 정상."""
    import json as _json

    class Resp:
        def read(self):
            return _json.dumps({"err": "11", "errMsg": "유효하지 않은 인증KEY입니다."}).encode()
        def __enter__(self):
            return self
        def __exit__(self, *a):
            return False

    monkeypatch.setattr(kosis.urllib.request, "urlopen", lambda u, timeout=40: Resp())
    with pytest.raises(kosis.KosisError, match="유효하지 않은 인증KEY"):
        kosis._request({"apiKey": "x"})


def test_missing_key_explains_how_to_get_one(monkeypatch):
    monkeypatch.delenv("KOSIS_API_KEY", raising=False)
    with pytest.raises(kosis.KosisError, match="활용신청"):
        kosis.api_key()


def test_parses_year_and_value():
    (r,) = kosis.parse_rows([row(2019, "시설딸기(수경)", "소득", 12_340)])
    assert (r.year, r.crop_name, r.item, r.value, r.unit) == (
        2019, "시설딸기(수경)", "소득", 12340.0, "원"
    )


def test_axis_order_differs_between_tables():
    """구표와 신표의 C1/C2 가 뒤바뀐다. 축을 고정하면 작목과 비목이 서로 바뀐다."""
    old = row(2022, "시설딸기", "소득", 100)
    new = row(2023, "시설딸기", "소득", 110, swapped=True)
    assert kosis.split_axes(old) == ("시설딸기", "소득")
    assert kosis.split_axes(new) == ("시설딸기", "소득")
    # 원본에서는 실제로 자리가 반대다
    assert old["C1_NM"] == "시설딸기" and new["C1_NM"] == "소득"


def test_both_table_layouts_merge_into_one_series():
    """구표(~2022)와 신표(2023~)를 이어 붙여야 12개년 시계열이 된다."""
    rows = kosis.parse_rows(
        [row(y, "시설딸기", "소득", 1000 + y) for y in range(2020, 2023)]
        + [row(y, "시설딸기", "소득", 1000 + y, swapped=True) for y in (2023, 2024)]
    )
    series = kosis.series_for(rows, "시설딸기", "income")
    assert [y for y, _ in series] == [2020, 2021, 2022, 2023, 2024]


def test_suppressed_cells_are_dropped():
    """비공표(-, X)와 빈 값은 버린다."""
    rows = kosis.parse_rows([
        row(2019, "시설딸기", "소득", 100),
        {**row(2020, "시설딸기", "소득", 0), "DT": "-"},
        {**row(2021, "시설딸기", "소득", 0), "DT": "X"},
        {**row(2022, "시설딸기", "소득", 0), "DT": ""},
        row(2023, "시설딸기", "소득", 120),
    ])
    assert [r.year for r in rows] == [2019, 2023]


# ── 작목명 매칭 ──────────────────────────────────────────────
def test_crop_name_matching_ignores_punctuation():
    assert kosis._normalize("시설딸기(수경)") == kosis._normalize("시설딸기 (수경)")


def test_every_crop_maps_to_kosis():
    """crops.json 의 kosis 매핑이 빠짐없이 있어야 캘리브레이션이 돈다."""
    from engine.params import crops

    for crop in crops().values():
        m = crop.kosis
        assert m, f"{crop.id} 에 kosis 매핑 없음"
        assert {"group", "name", "series_name", "ratio_base"} <= set(m)
        assert m["group"] in kosis.TABLES


def test_cultivation_methods_stay_separate():
    """수경과 토경이 섞이면 이 경로의 존재 이유가 사라진다."""
    rows = kosis.parse_rows([
        row(2023, "시설딸기(수경)", "소득", 1400, swapped=True),
        row(2024, "시설딸기(수경)", "소득", 1500, swapped=True),
        row(2023, "시설딸기", "소득", 1100, swapped=True),
        row(2024, "시설딸기", "소득", 1150, swapped=True),
    ])
    assert kosis.series_for(rows, "시설딸기(수경)") == [(2023, 1400.0), (2024, 1500.0)]
    assert kosis.series_for(rows, "시설딸기") == [(2023, 1100.0), (2024, 1150.0)]


def test_income_rate_is_not_mistaken_for_income():
    """'소득률' 이 '소득' 부분일치에 걸리면 시계열이 오염된다."""
    rows = kosis.parse_rows([
        row(2020, "시설딸기", "소득", 1400),
        row(2020, "시설딸기", "소득률", 48),
    ])
    assert kosis.series_for(rows, "시설딸기", "income") == [(2020, 1400.0)]


def test_gross_and_cost_series_are_selectable():
    rows = kosis.parse_rows([
        row(2020, "시설딸기", "총수입", 2900),
        row(2020, "시설딸기", "경영비", 1433),
        row(2020, "시설딸기", "소득", 1467),
    ])
    assert kosis.series_for(rows, "시설딸기", "gross") == [(2020, 2900.0)]
    assert kosis.series_for(rows, "시설딸기", "cost") == [(2020, 1433.0)]


def test_discovery_helpers_list_what_arrived():
    rows = kosis.parse_rows([row(2020, "시설딸기", "소득", 1), row(2020, "시설토마토", "총수입", 2)])
    assert kosis.available_crops(rows) == ["시설딸기", "시설토마토"]
    assert kosis.available_items(rows) == ["소득", "총수입"]


# ── 영업레버리지 ─────────────────────────────────────────────
def test_dol_is_gross_over_income_when_all_cost_is_fixed():
    lev = degree_of_operating_leverage(29_000_000, 14_330_000)
    assert lev.income_per_10a == pytest.approx(14_670_000)
    assert lev.dol == pytest.approx(29_000_000 / 14_670_000, rel=1e-6)


def test_higher_fixed_cost_means_higher_leverage():
    """같은 소득이라도 고정비가 크면 소득이 더 크게 흔들린다 — 수경 vs 토경의 핵심."""
    heavy = degree_of_operating_leverage(29_000_000, 14_330_000)   # 고정비 큼
    light = degree_of_operating_leverage(18_000_000, 3_330_000)    # 고정비 작음
    assert heavy.dol > light.dol
    assert heavy.apply(0.15) > light.apply(0.15)


def test_variable_cost_share_lowers_leverage():
    full = degree_of_operating_leverage(29_000_000, 14_330_000, fixed_cost_share=1.0)
    half = degree_of_operating_leverage(29_000_000, 14_330_000, fixed_cost_share=0.5)
    assert half.dol < full.dol
    assert full.dol == pytest.approx(1 + 14_330_000 / 14_670_000)


def test_leverage_rejects_nonviable_inputs():
    with pytest.raises(ValueError):
        degree_of_operating_leverage(10_000_000, 12_000_000)   # 소득이 음수
    with pytest.raises(ValueError):
        degree_of_operating_leverage(0, 0)


def test_same_price_series_yields_different_income_sigma():
    """가격은 재배방식과 무관하다. 그래도 σ_소득 은 갈려야 한다 — (a) 한계의 해소."""
    price_sigma = 0.30
    hydro = degree_of_operating_leverage(29_000_000, 14_330_000)
    soil = degree_of_operating_leverage(21_000_000, 9_500_000)
    assert hydro.apply(price_sigma) != pytest.approx(soil.apply(price_sigma))


# ── 분산분해 ─────────────────────────────────────────────────
def test_decompose_then_combine_round_trips():
    idio = decompose(0.30, 0.18)
    assert combine(0.18, idio) == pytest.approx(0.30)


def test_decompose_clamps_instead_of_going_imaginary():
    """측정오차로 공통 성분이 총량을 넘어도 음수 분산을 만들지 않는다."""
    assert decompose(0.10, 0.25) == 0.0


def test_national_average_is_a_lower_bound():
    """전국 평균 σ 에 고유 성분을 얹으면 반드시 커진다."""
    lifted = lift_national_average(0.18, 0.15)
    assert lifted > 0.18
    assert lifted == pytest.approx(math.hypot(0.18, 0.15))


def test_idiosyncratic_recovered_from_price_and_leverage():
    lev = degree_of_operating_leverage(29_000_000, 14_330_000)
    explained = lev.apply(0.08)                    # 가격이 설명하는 몫
    total = math.hypot(explained, 0.12)            # 여기에 고유 0.12 를 얹은 총량
    assert implied_idiosyncratic_from_leverage(total, 0.08, lev) == pytest.approx(0.12)


# ── 수집 → 추정 연결 ─────────────────────────────────────────
def test_published_series_feeds_the_annual_estimator():
    """공표 소득 시계열이 그대로 σ 추정기로 들어간다 — 환산 가정 없음."""
    values = [1200, 1310, 1180, 1450, 1390, 1270, 1520, 1480, 1350, 1467]
    rows = kosis.parse_rows(
        [row(2014 + i, "시설딸기", "소득", v) for i, v in enumerate(values)]
    )
    series = [v for _, v in kosis.series_for(rows, "시설딸기")]
    est = estimate_from_annual_series(series, "KOSIS 농산물소득조사")
    assert 0.05 < est.sigma < 0.30
    assert est.ci_low < est.sigma < est.ci_high
    assert est.method == "annual_log_return_sd"
