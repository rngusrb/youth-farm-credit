# WORKFLOW — 작업 프로토콜

## 태스크 관리 규칙

- TASKS.md 에는 **현재 태스크 최대 3개**만 (완료 본문 금지 — harness lint 실패)
- 완료 → `docs/sprints/` 아카이브 → BACKLOG.md 에서 다음 올림

### 태스크 연장 vs 백로그

| 기준 | 처리 |
|------|------|
| 현재 테스트 통과에 직접 영향, 2~3줄 이내 | 현재 태스크 연장 |
| 별도 파일/모듈 영향, 설계 고민 필요 | BACKLOG.md |

---

## 멀티에이전트 구성

복잡한 작업(신규 모듈, 구조 변경):

```
1. Maker    → task-start → 구현 → harness {folder}/
2. Reviewer → 변경 파일 + 테스트 결과 + _GUIDE.md 기준 read-only 검토
            → PASS / REVISE / BLOCKED 판정 선언 (형식 필수)
3. [REVISE]  → Maker 재작업 (1회 한도) → Reviewer 재검토
   [BLOCKED] → 즉시 사용자 보고, 자동 진행 금지
   [PASS]    → harness all → sprint-close
```

**Reviewer PASS 없이 sprint-close 진입 금지.**

단순 작업(버그픽스, 단일 파일) → CLAUDE.md 단순 프로토콜.

---

## 이슈 심각도

| 심각도 | 의미 | 처리 |
|--------|------|------|
| 🔴 Critical | 결과 무효화 (전제 붕괴, 순환 논리) | BLOCKED → 즉시 보고 |
| 🟠 High | 수치·동작 크게 왜곡 | REVISE → 재작업 필수 |
| 🟡 Medium | 구조적 문제, 영향 제한적 | 진행 가능, TASKS.md 에 known issue 기록 |
| 🟢 Low | 개선 여지 | 기록 선택 |

동일 에러 2회 연속 → 설계 재검토.
**Medium 은 묻히면 안 된다.** 반드시 문서에 남긴다.

---

## Silent Failure 체크

```
□ except 로 삼키고 넘어가는 곳이 있는가
□ 빈 값 반환 시 호출자가 알아챌 수 있는가
□ 기본값 fallback 에 로그가 있는가
□ "정상처럼 보이는 실패"가 가능한 경로가 있는가
```

---

## Skills

| 스킬 | 트리거 |
|------|--------|
| `task-start` | 새 태스크 시작 |
| `harness-run` | 코드 수정 후 검증 |
| `maker-review-loop` | 복잡한 태스크 시작 |
| `sprint-close` | 스프린트 완료 |
