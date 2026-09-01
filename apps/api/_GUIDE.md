# api/ — 레이어 가이드

## 역할
HTTP 경계. 요청을 받아 검증하고, core 를 부르고, 응답으로 직렬화한다.

**이 레이어가 소유하지 않는 것**: 여신 계산(→ core `engine`/`estimators`),
외부 호출·LLM·검색(→ adapters `llm`/`rag`/`stats`).
**의존 방향**: `api → core, adapters` (`meta/boundaries.yaml` 선언, `deps_check` 가 집행).

---

## 핵심 패턴

### 요청/응답 스키마는 이 레이어에만
```python
# ✅ apps/api/schemas.py — Pydantic 은 이 레이어에만
class DiagnoseRequest(BaseModel):
    crop_id: str
    area_ha: float

@app.post("/api/v1/diagnose")
def run_diagnose(req: DiagnoseRequest) -> dict:
    result = diagnose.run(req.crop_id, req.area_ha)   # core 호출 — 숫자는 여기서만 나온다
    return result
```
**이유**: `engine/` 이 Pydantic 을 알면 HTTP 를 아는 것이다. 그 순간 core 를 HTTP 없이
테스트할 수 없고, "숫자는 엔진이 만든다"는 주장의 증거(외부 의존 0)가 사라진다.

---

## 금지사항

### ❌ 라우터에서 비즈니스 판단
```python
# ❌ 금지 — 여신 판단이 라우터에 샌다
if area_ha < 0.3 and loan_amount > 50_000_000:
    raise HTTPException(400)          # 이 기준이 왜 여기 있나

# ✅ 대신
result = diagnose.run(...)            # core 가 판단, api 는 예외를 상태코드로 번역
```
**이유**: 같은 규칙이 다른 진입점(배치·CLI·웹훅)에서 안 먹는다. 규칙이 두 벌이 되면 반드시 갈라진다.

### ❌ 에러를 그대로 노출
```python
# ❌ 금지 — 내부 구조가 새어나간다
except Exception as e:
    return {"error": str(e)}

# ✅ 대신 — 로그엔 전문, 응답엔 코드
log.exception("charge 실패 user=%s", user_id)
raise HTTPException(500, detail={"code": "CHARGE_FAILED"})
```

---

## GC 패턴

> ⚠️ **레이어 전체에 걸리는 규칙은 여기 적지 않는다.** `meta/boundaries.yaml` 의
> `forbidden_symbols` 가 그걸 소유하고 `deps_check.py` 가 집행한다.
> 같은 규칙을 두 곳에 적으면 반드시 갈라진다 — 여기엔 **이 폴더에만 해당하는 것**만.

레이어 전체 규칙(여신 판단·외부 호출 금지)은 **`meta/boundaries.yaml`** 이 소유하고
`deps_check.py` 가 집행한다. 아래 gc 블록엔 이 폴더 고유 규칙만 둔다.

```gc
pattern: "str\(e\)"
message: "예외 문자열 그대로 응답 금지 — 내부 구조 노출 (로그엔 전문, 응답엔 코드)"
```

## 하네스

```
apps/api/tests/test_api.py
apps/api/tests/test_data_integrity.py
```

## 모듈 지도 — api — HTTP 경계

| 모듈 | 역할 |
|---|---|
| `main.py` | FastAPI 앱. 엔드포인트 7개. 계산은 하지 않고 core 를 부른다 |
| `schemas.py` | 요청·응답 스키마. 입력 검증이 여기서 끝나야 core 가 방어 코드를 안 쓴다 |
| `agent.py` | 상담 오케스트레이션 — 계획→실행→설명→검증, 예산 상한 |
