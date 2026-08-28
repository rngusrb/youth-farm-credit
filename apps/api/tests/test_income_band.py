"""평년 소득이 흔들리는 범위 (UX-011).

왜 있나: 농가 화면에 "σ 0.215" 대신 "4,300만~7,500만원" 이라고 쓰려면 그 숫자를
누군가 만들어야 한다. 화면에서 σ 를 ±% 로 환산하면 그건 화면이 만든 숫자다.
엔진이 내고, **시뮬레이터와 같은 분포**여야 한다 — 어긋나면 화면과 리포트가
다른 말을 하게 된다.
"""
import numpy as np

from engine.diagnose import DiagnoseInput, diagnose
from engine.income import income_band


def test_시뮬레이터와_같은_분포다():
    """simulate.draw_paths 의 shock 을 직접 뽑아 분위수를 비교한다."""
    expected, sigma = 58_195_041.0, 0.2148
    rng = np.random.default_rng(42)
    shock = np.exp(sigma * rng.normal(size=400_000) - 0.5 * sigma**2)
    p10, p90 = np.percentile(expected * shock, [10, 90])
    lo, hi = income_band(expected, sigma)
    assert abs(p10 - lo) / p10 < 0.01, f"하위10% 어긋남: 시뮬 {p10:,.0f} vs 공식 {lo:,.0f}"
    assert abs(p90 - hi) / p90 < 0.01, f"상위10% 어긋남: 시뮬 {p90:,.0f} vs 공식 {hi:,.0f}"


def test_평년소득을_사이에_둔다():
    lo, hi = income_band(58_195_041.0, 0.2148)
    assert lo < 58_195_041.0 < hi


def test_변동이_클수록_범위가_넓다():
    narrow = income_band(50_000_000.0, 0.10)
    wide = income_band(50_000_000.0, 0.40)
    assert (wide[1] - wide[0]) > (narrow[1] - narrow[0])


def test_변동이_없으면_범위도_없다():
    assert income_band(50_000_000.0, 0.0) == (50_000_000.0, 50_000_000.0)


def test_소득이_0이하면_범위를_만들지_않는다():
    """무차입으로도 생계가 안 되는 경우. 없는 범위를 지어내지 않는다."""
    assert income_band(0.0, 0.2) == (0.0, 0.0)


def test_진단이_범위를_낸다():
    d = diagnose(DiagnoseInput(crop_id="strawberry_hydro", pyeong=1200, living_cost=30_000_000))
    lo, hi = d["income"]["band_p10_p90"]
    assert lo < d["income"]["annual"] < hi
