---
name: maker-review-loop
description: |
  Use this for complex tasks (new modules, structural changes).
  Triggers on: WORKFLOW.md "복잡한 작업" 분류, 신규 파일 추가, 파이프라인 수정,
  or any task touching more than one folder.
---

# Maker-Reviewer Loop Skill

## Goal
복잡한 태스크에서 구현자와 검토자를 **명시적으로 분리**한다.
핵심은 자동 반복 루프가 아니라 **강한 PASS 게이트**다.

## 역할

| 역할 | 책임 |
|------|------|
| **Maker** | 구현 + 폴더 단위 harness 실행 |
| **Reviewer** | 변경 파일 / 테스트 결과 / 관련 _GUIDE.md 기준 **read-only** 검토 |

Reviewer 는 코드를 직접 수정하지 않는다. 판정과 findings 만 작성한다.

---

## 실행 순서

### Phase 1 — Maker
1. `task-start` 로 컨텍스트 로드
2. 구현
3. `python scripts/harness.py {folder}/`
4. TASKS.md `### 구현 세부사항` 갱신

### Phase 2 — Reviewer
검토 기준: 변경 파일 / harness 결과 / 관련 `_GUIDE.md` 금지사항 / WORKFLOW.md Silent Failure 체크리스트

**반드시 이 형식으로 판정 선언:**
```
## Reviewer Verdict

판정: PASS | REVISE | BLOCKED

### Findings
| 심각도 | 항목 | 내용 |
|--------|------|------|

### 판정 근거
...
```
findings 없으면 테이블 생략, `판정: PASS` + 근거 한 줄로 충분.

### Phase 3 — 판정 처리

| 판정 | 처리 |
|------|------|
| **PASS** | `harness all` → sprint-close 진입 가능 |
| **REVISE** | Maker 재작업 → Phase 2 재실행 (**최대 1회**) |
| **BLOCKED** | 즉시 사용자 보고, 자동 진행 금지 |

---

## 판정 기준

**PASS** (전부 충족): High/Critical findings 없음 · 폴더 harness 통과 · 문서 갱신 범위 충족
**REVISE** (하나라도): High 이상 finding · 새 로직에 테스트 없음 · 문서 정합성 미흡
**BLOCKED**: Critical finding · 같은 실패 2회 연속 · Reviewer 재검토 1회 초과

| 심각도 | 처리 |
|--------|------|
| Critical | BLOCKED → 사용자 보고 |
| High | REVISE → 재작업 필수 |
| Medium | 진행 가능, **TASKS.md 에 known issue 기록 의무** |
| Low | 기록 선택 |

---

## Constraints
- Reviewer 코드 직접 수정 금지
- PASS 없이 sprint-close 실행 금지
- **형식 없이 구두로 "좋다"고 하는 것은 PASS 로 인정하지 않음**
- 1회 재작업 후에도 REVISE → 자동 진행 중단, 설계 재검토 보고
