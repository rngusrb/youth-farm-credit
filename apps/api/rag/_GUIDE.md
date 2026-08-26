# adapters/ — 레이어 가이드

## 역할
외부 세계에 말 거는 곳 전부 — DB, LLM API, 결제, 메일, 파일 저장소.

**이 레이어가 소유하지 않는 것**: 비즈니스 판단. 어댑터는 "어떻게 부르는지"만 알고
"불러야 하는지"는 모른다.

**의존 방향**: 아무것도 부르지 않는다 (`adapters → []`).

> ⚠️ **아래 금지사항은 상상이 아니다.** 전부 LLM 파이프라인을 실제로 운영하다 격추당한
> 기록이다. 다른 프로젝트에서 피로 산 것이라 근거가 있고, 그래서 처음부터 탑재한다.

---

## 핵심 패턴

### 어댑터는 core 가 선언한 모양을 구현한다
```python
# ✅ adapters/llm/summarizer.py
class OpenAISummarizer:                      # core.ports.Summarizer 를 만족
    def summarize(self, text: str) -> str:
        resp = self._client.chat(...)        # 프롬프트도 타임아웃도 여기 산다
        return self._parse(resp)
```

### 실패는 도메인 예외로 번역한다
```python
# ✅ 외부 라이브러리 예외가 core 로 새어나가지 않게
except httpx.TimeoutException as e:
    raise ExternalTimeout("summarizer", timeout_s=self.timeout) from e
```

---

## 금지사항

> ⚠️ **아래 금지사항의 근거는 다른 프로젝트(LLM 파이프라인 운영)의 사고다.**
> 규칙은 여기서도 유효하지만 **이 저장소에서 재현된 적은 없다** — 그래서 라벨이
> `사고 이력` 이 아니라 `이식된 규칙` 이다. 겪지도 않은 일을 사고 이력으로 적으면
> 가짜 근거가 되어 아무도 그 규칙을 못 지운다. 여기서 실제로 터지면 그때
> `사고 이력` 으로 승격하고 날짜를 적는다.

### ❌ 타임아웃을 기본값에 맡기기
```python
# ❌ 금지
client = OpenAI()                      # 기본 타임아웃이 얼마인지 아무도 모른다

# ✅ 대신 — 명시 + 재시도 상한
client = OpenAI(timeout=900, max_retries=3)
```
**이식된 규칙**: 입력이 갑자기 길어지는 구간(뉴스가 몰리는 주간)에서 서버 큐가 포화 →
클라이언트 **기본 5초** 타임아웃에 걸려 11개 호출이 연쇄 전멸. 같은 날짜에서 두 번 재현되고서야
"하드웨어 문제"가 아니라 데이터 의존 버그임이 확인됐다.

### ❌ 빈 응답을 성공으로 세기
```python
# ❌ 금지
results.append(parse(resp))            # resp 가 빈 문자열이어도 그냥 쌓인다

# ✅ 대신 — 빈 결과는 즉시 실패
if not resp or not resp.strip():
    raise EmptyResponse(model=self.model, prompt_tokens=n)
```
**이식된 규칙**: 빈 응답이 정상처럼 누적되어 결과 폴더 10개가 빈 채로 생성됐고,
상태 파일 3종까지 오염되어 전량 폐기 후 처음부터 재실행했다.

### ❌ 쿼터·크레딧 소진 시 계속 돌기
```python
# ❌ 금지 — "실패해도 루프는 계속" 정책
except APIError:
    log.warning("실패, 계속"); continue

# ✅ 대신 — 소진성 오류는 즉시 중단
except (InsufficientQuota, RateLimitExhausted) as e:
    raise FatalExternalError("크레딧 소진 — 즉시 중단") from e
```
**이식된 규칙**: 크레딧이 떨어진 뒤에도 루프가 계속 돌며 빈 결과를 대량 생산했다.
**되돌릴 수 없는 오염**이라 상태 파일을 백업에서 복원해야 했다.

### ❌ 응답 원문을 안 남기기
```python
# ✅ 파싱 실패 시 원문이 없으면 원인 추적이 불가능하다
except json.JSONDecodeError as e:
    log.error("파싱 실패 model=%s raw=%r", self.model, resp[:2000])
    raise
```
**이식된 규칙**: 응답이 토크나이저 경계 문제로 제어 문자에 오염돼 JSON 이 전멸했는데,
원문을 안 남겨서 며칠간 원인을 못 찾았다.

### ❌ 파싱 실패를 통째로 버리거나 통째로 죽이기
```python
# ✅ 레코드 단위로 격리 — 성공과 거부를 둘 다 돌려준다
return ok, rejected        # 호출자가 rejected 를 반드시 받는다
```
**이식된 규칙**: 조용히 탈락한 레코드를 2주 뒤에야 발견했다. 그때까지 로그엔 "정상 처리됨"이었다.

---

## GC 패턴

> ⚠️ **레이어 전체에 걸리는 규칙은 여기 적지 않는다.** `meta/boundaries.yaml` 의
> `forbidden_symbols` 가 그걸 소유하고 `deps_check.py` 가 집행한다.
> 같은 규칙을 두 곳에 적으면 반드시 갈라진다 — 여기엔 **이 폴더에만 해당하는 것**만.

아래는 boundaries.yaml 에 없는 **이 폴더 고유 규칙**이라 여기가 소유한다.

```gc
pattern: "(?i)(OpenAI|Anthropic|AsyncClient|httpx\.Client)\(\s*\)"
message: "타임아웃 미지정 클라이언트 금지 — timeout·max_retries 명시 (연쇄 전멸 사고)"
pattern: "except\s+\w*(APIError|Exception)[^:]*:\s*(pass|continue)"
message: "외부 호출 실패를 삼키지 않는다 — 소진성 오류는 즉시 중단"
```

---

## 하네스

```
apps/api/tests/test_rag_corpus.py
apps/api/tests/test_rag.py
```

> **계약 테스트와 품질 테스트를 절대 섞지 않는다.**
>
> | 축 | 언제 | 비용 | 무엇을 |
> |---|---|---|---|
> | 계약 (`tests/contract/`) | 매 커밋 | 무료 | 깨진 JSON·빈 응답·타임아웃·재시도를 **가짜 응답**으로 |
> | 품질 (`evals/`) | 야간·수동 | 유료 | 골든셋 실제 호출, **기준선 대비 회귀**만 판정 |
>
> 섞으면 커밋마다 돈이 나가고 불안정해서 결국 사람이 다 꺼버린다. 그러면 검사가 통째로 사라진다.

---

## 모듈 지도 — adapters — 제도 근거

| 모듈 | 역할 |
|---|---|
| `ingest.py` | 지침 원문 → 조항 단위 청킹. 메타데이터 필수 검사 |
| `retrieve.py` | BM25 (한국어용 문자 bigram 혼합) |
| `answer.py` | 인용 강제. citations 가 비면 답변을 생성하지 않는다 |
| `expand.py` | 질의 확장. 사용자의 말('이자 언제 내요')을 지침의 말('연 1회 후취')로 |
| `fetch_guidelines.py` | 시행지침 원문 수집 CLI. 한 번만 돌린다 |

> 코퍼스는 `data/corpus/*.txt` 에 커밋돼 있다 (2026년 시행지침 3종, 709청크).
> 원문 수집은 `python -m rag.fetch_guidelines`, 색인은 `python -m rag.ingest`.
> 코퍼스가 비면 API 는 항상 "확인된 근거를 찾지 못했습니다" 를 반환한다 — 고장이 아니라 설계다.

## 규칙

- **코퍼스에 없는 문장을 인용으로 내보내지 않는다.** citations 가 비면 답변도 없다.
- 청크는 3,000자를 넘기지 않는다. 큰 덩어리는 서로 다른 질문에 똑같이 걸려서 둘 다 틀린다.
- `section_path` 는 그 지침의 장·절이어야 한다. 본문에 **인용된** 법령 조문(`제79조`)을
  장으로 잡으면 출처 표기가 거짓이 된다. (실제로 그랬다 — test_rag_corpus.py 가 지킨다)
- 검색 품질을 건드렸으면 `test_rag_corpus.py` 의 recall 하한을 확인한다.
  하한을 낮추는 커밋은 이유를 커밋 메시지에 적는다.
