# core/ — 레이어 가이드

## 역할
비즈니스 규칙. **이 프로젝트가 존재하는 이유가 여기 있다.**

**이 레이어가 소유하지 않는 것**: HTTP, DB, 외부 API, 환경변수, 프롬프트.
**의존 방향**: `core → adapters` (인터페이스만). api 를 절대 부르지 않는다.

> core 는 **인터넷 없이 전부 테스트되어야 한다.** 이게 이 레이어가 지켜지는지 판별하는 기준이다.

---

## 핵심 패턴

### 외부는 주입받는다
```python
# ✅ core/billing/service.py
class PaymentPort(Protocol):                  # core 가 필요한 모양을 선언
    def charge(self, cents: int) -> ChargeResult: ...

def charge(port: PaymentPort, cents: int) -> ChargeResult:
    if cents <= 0:
        raise InvalidAmount(cents)            # 규칙은 여기
    return port.charge(cents)                 # 실행은 밖에
```
**이유**: 테스트에서 가짜 port 를 넣으면 끝난다. 결제사를 바꿔도 core 는 한 줄도 안 바뀐다.

---

## 금지사항

### ❌ 프롬프트 문자열
```python
# ❌ 금지
prompt = f"You are a helpful assistant. Summarize: {text}"

# ✅ 대신 — core 는 '요약이 필요하다'까지만 안다
summary = summarizer.summarize(text)          # adapters 가 프롬프트를 소유
```
**이유**: 프롬프트가 비즈니스 로직에 섞이면 **테스트가 불가능해지고 모델을 못 바꾼다.**
LLM 응답의 비결정성이 core 전체로 번진다.

### ❌ 환경변수 직접 읽기
```python
# ❌ 금지
timeout = int(os.environ["TIMEOUT"])

# ✅ 대신 — 설정은 주입
def charge(port, cents, *, config: Config): ...
```
**이유**: 환경에 따라 규칙이 달라지면 그 규칙은 재현이 안 된다.

---

## GC 패턴

> ⚠️ **레이어 전체에 걸리는 규칙은 여기 적지 않는다.** `meta/boundaries.yaml` 의
> `forbidden_symbols` 가 그걸 소유하고 `deps_check.py` 가 집행한다.
> 같은 규칙을 두 곳에 적으면 반드시 갈라진다 — 여기엔 **이 폴더에만 해당하는 것**만.

위 금지사항(프롬프트·환경변수·SQL)은 **`meta/boundaries.yaml` 의 `forbidden_symbols.core`**
가 집행한다. 확인: `python scripts/deps_check.py`

이 폴더에만 해당하는 규칙이 생기면 아래에 추가한다.

```gc
pattern: "from api\."
message: "core 는 api 를 부르지 않는다 (역방향)"
```

## 하네스

```
apps/api/tests/test_cashflow.py
apps/api/tests/test_stress.py
apps/api/tests/test_golden.py
apps/api/tests/test_risk.py
apps/api/tests/test_personalization.py
apps/api/tests/test_as_of.py
apps/api/tests/test_income_band.py
apps/api/tests/test_levers.py
apps/api/tests/test_tools.py
apps/api/tests/test_prescribe.py
```
> `test_core_is_pure.py` = **불변식**. core 가 네트워크·DB·환경변수 없이 도는지 검사한다.

## 모듈 지도 — core — 여신 계산

| 모듈 | 역할 |
|---|---|
| `params.py` | crops/loan_products/policy 로더. 데이터 정의의 단일 출처 |
| `loan.py` | 상환 스케줄·연금계수·최대상환액. 원금균등/원리금균등 분기 |
| `income.py` | 작목·면적 → 연 소득 |
| `dscr.py` | 상환여력, DSCR 한도 역산, 최소면적 |
| `simulate.py` | 몬테카를로. 소득경로(draw_paths)와 평가(evaluate) 분리 |
| `risk_limit.py` | 위험기반 한도 이분탐색, σ 불확실성 밴드, 생계 제약 판정 |
| `cashflow.py` | 월별 현금흐름. 총수입은 출하월에, 비용은 12개월 균등 |
| `stress.py` | 시나리오 스트레스(가격↓·생산량↓·금리↑·재해). 영업레버리지 반영 |
| `diagnose.py` | 위 전부를 묶는 오케스트레이션. 결과 id 인코딩 |

> **이 폴더는 인터넷 없이 전부 테스트된다.** 외부 의존 0, 환경변수 0, 프롬프트 0.
> 이 성질이 "숫자는 LLM 이 만들지 않는다"는 원칙의 기계적 보장이다.
| `tools.py` | 엔진을 **도구**로 노출 — ToolSpec 선언·실행·refs 좌표 |
| `errors.py` | core 도메인 예외 (HTTP 를 모른다) |
| `benchmark.py` | 전국 작목 평균 대비 — 실적이 없으면 비교하지 않는다 |
