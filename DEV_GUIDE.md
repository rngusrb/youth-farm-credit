# DEV_GUIDE — 코드 작성 참고서

> 코드 수정 전 읽는 문서. CLAUDE.md(원칙)와 달리 여기엔 **실제 수정 절차와 지도**가 있다.

## ★ 대규칙 — 모든 작업에 적용

```
1. 작업 전  → 해당 폴더 _GUIDE.md 확인
2. 작업 전  → baseline 파악:  python scripts/harness.py <폴더>/
3. 코드 수정
4. 작업 후  → harness 재실행
5. 실패 시  → 원인 → 수정 → 4번으로 (같은 실패 2회 연속이면 중단·보고)
6. 통과 시  → _GUIDE.md ## 금지사항에 새 패턴 추가 (사고 이력 포함)
7. 경계 확인 → python scripts/deps_check.py
```

**6번이 핵심.** 같은 실수가 반복되는 유일한 이유는 규칙이 안 쌓였기 때문이다.

> ⚠️ 실제 변경이 있을 때만 문서를 갱신한다. 점검만 한 경우 갱신 금지.

---

## 시스템 지도

```
                    apps/web  (Next.js App Router)
                         │  fetch
                         ▼
   ┌─────────────────────────────────────────────┐
   │  api      apps/api/main.py · schemas.py     │  HTTP 경계·검증·직렬화
   └───────────────┬──────────────┬──────────────┘
                   │              │
        ┌──────────▼───────┐   ┌──▼───────────────────────────┐
        │  core            │   │  adapters                    │
        │  engine/         │   │  llm/   슬롯추출·해설·수치검증 │
        │  estimators/     │◄──│  rag/   조항청킹·BM25·인용     │
        │                  │   │  stats/ KOSIS·KAMIS·캘리브레이션│
        │  외부 의존 0      │   └──────────────────────────────┘
        └──────────────────┘         (adapters → core 는 허용:
                                      stats 가 crops 정의를 읽는다)
```

의존 방향은 `meta/boundaries.yaml` 이 선언하고 `scripts/deps_check.py` 가 집행한다.
**`core: []` — engine/estimators 는 아무것도 부르지 않는다.** 이게 "숫자는 LLM 이
만들지 않는다"는 주장의 기계적 증거다. 근거 → `docs/decisions/0001-pure-estimators-belong-to-core.md`

### 실행 경로

| 진입점 | 경로 | 형태 |
|--------|------|------|
| API 서버 | `apps/api/main.py` | FastAPI (`/api/v1/*`) |
| 웹 | `apps/web/app/` | Next.js App Router |
| σ 캘리브레이션 | `apps/api/stats/calibrate.py` | CLI — 수집→추정→`crops.json` |
| 검증 | `scripts/harness.py all` | 테스트 + Doc Lint + 경계 |

---

## "X를 바꾸려면 어디 봐라" 색인

> 이 표가 이 문서의 존재 이유다. 새 세션이 5초 만에 파일을 찾게 한다.

| 바꾸려는 것 | 봐야 할 파일 |
|------------|------------|
| 상환 스케줄·연금현가 | `apps/api/engine/loan.py` |
| DSCR·상환여력·한도 역산 | `apps/api/engine/dscr.py` |
| 작목·면적 → 소득 | `apps/api/engine/income.py` |
| 몬테카를로(소득충격·재해·상환연기) | `apps/api/engine/simulate.py` |
| 위험기반 한도·σ 불확실성 밴드 | `apps/api/engine/risk_limit.py` |
| 진단 오케스트레이션·결과 id | `apps/api/engine/diagnose.py` |
| 현금흐름 / 스트레스 시나리오 | `apps/api/engine/cashflow.py` · `stress.py` |
| 작목 파라미터·대출상품·재해규칙 | `apps/api/data/` + `engine/params.py` |
| σ 추정(GARCH·계층축소·부트스트랩) | `apps/api/estimators/` |
| KOSIS·KAMIS 수집 | `apps/api/stats/kosis.py` · `kamis.py` |
| σ 실측 → crops.json 반영 | `apps/api/stats/calibrate*.py` |
| LLM 슬롯추출·해설·수치검증 | `apps/api/llm/` |
| 제도 근거 검색·인용 | `apps/api/rag/` |
| API 엔드포인트·요청/응답 스키마 | `apps/api/main.py` · `schemas.py` |
| 화면·차트·내비 | `apps/web/app/` · `apps/web/components/` |
| 레이어 경계 규칙 | `meta/boundaries.yaml` |

---

## 전역 금지사항

> 폴더 하나에 국한되지 않는 규칙만. 폴더 한정 규칙은 각 _GUIDE.md 로.

### 1. LLM 이 만든 수치를 그대로 내보내기 금지
```python
# ❌ 금지 — 해설 문장의 숫자를 검증 없이 반환
return llm_explain(result)

# ✅ 대신 — 엔진 출력과 대조해 불일치 문장 제거 후 반환
return verify_numbers(llm_explain(result), engine_output=result)
```
**이유**: 이 서비스의 존재 이유가 "숫자는 엔진이 만든다"이다. 한 번 뚫리면 주장 전체가 무너진다.

### 2. core 에서 외부 의존 추가 금지
`engine/`·`estimators/` 에 `requests`·`os.environ`·프롬프트 문자열을 넣지 않는다.
**사고 이력**: 2026-08-26 `diagnose.py` 가 `stats.shrinkage` 를 **함수 안에 숨겨** import
하고 있었다. 숨긴 것 자체가 경계 위반 신호였고, 실제 원인은 순수 추정기가 adapters 폴더에
잘못 놓여 있던 것이었다. → `estimators/` 분리.

### 3. API 키 없는 경로를 깨뜨리기 금지
키 부재 시 규칙기반 폴백으로 전체 플로우가 돌아야 한다. 데모·심사에서 이게 생명줄이다.

---

## 폴더별 _GUIDE.md 위치

| 폴더 | 레이어 | 가이드 |
|------|--------|--------|
| `apps/api` | api | `apps/api/_GUIDE.md` |
| `apps/api/engine` | core | `apps/api/engine/_GUIDE.md` |
| `apps/api/estimators` | core | `apps/api/estimators/_GUIDE.md` |
| `apps/api/llm` | adapters | `apps/api/llm/_GUIDE.md` |
| `apps/api/rag` | adapters | `apps/api/rag/_GUIDE.md` |
| `apps/api/stats` | adapters | `apps/api/stats/_GUIDE.md` |
| `apps/web` | (프론트) | `apps/web/_GUIDE.md` |

---

## 새 클론 온보딩

```bash
sh scripts/install_git_hooks.sh   # 커밋 시 harness all 강제
sh scripts/verify.sh              # 완료 검증 단일 명령
```

읽는 순서: `CLAUDE.md` → 이 문서 → `meta/boundaries.yaml` → 건드릴 폴더의 `_GUIDE.md`

---

## harness 사용법

```bash
python scripts/harness.py apps/api/engine/    # 폴더 단위
python scripts/harness.py apps/api/engine/ --gc   # + 금지 패턴 검사
python scripts/harness.py all                 # 전체 + Doc Lint  ← "완료"의 정의
python scripts/harness.py all --rules         # 규칙 계기판 (기계 집행 비율)
python scripts/deps_check.py --graph          # 선언 vs 실제 의존
python scripts/feature_view.py --list         # 기능 × 레이어
```

*마지막 갱신: 2026-08-26 — 골격 이식 후 실제 구조 반영 (지도·색인·전역 금지 3종 신설)*
