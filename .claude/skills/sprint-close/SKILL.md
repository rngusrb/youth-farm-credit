---
name: sprint-close
description: |
  Use this when all tasks in the current sprint are completed and need archiving.
  Triggers on: "스프린트 완료", "다 끝났어", "클로즈아웃",
  or after harness all passes with no remaining in_progress tasks.
---

# Sprint Close Skill

## Goal
스프린트 완료 시 문서를 정리하고 아카이브를 생성한다.
**사람이 기억할 필요 없이 일관된 클로즈아웃을 보장한다.**

## 완료 상태 정책
```
태스크 완료 → TASKS.md 에 상태: completed 표시 (잠깐 허용)
           → sprint-close 실행 (감지 + 아카이브 + 제거)
           → harness lint: completed 본문 없음 → PASS
```
lint 의 "완료 본문 금지"는 sprint-close 를 안 돌렸을 때 잡는 **안전망**이다.

## Instructions

1. **TASKS.md 확인**
   - 전부 completed 인지 확인. in_progress/pending 남아있으면 중단·보고
   - **복잡 태스크 추가 확인**: `### Final Gate` 가 있으면 전부 `[x]` 인지
     - "Reviewer PASS 선언" 미체크 → **즉시 중단**
     - Medium 이상 findings 미기록 → **즉시 중단**

2. **아카이브 생성** — `docs/sprints/SPRINT_{YYYY-MM-DD}_{slug}.md`
   포함: 목표 / 태스크별 완료 기준 달성 여부 / harness 결과 / **발견된 사고와 추가된 규칙** / 미완성 항목

3. **TASKS.md 정리** — 완료 본문 제거, "현재 스프린트: 없음" 초기화

4. **BACKLOG.md 갱신** — 후속 이슈 추가, 완료 항목 삭제,
   **상단 "현재 상태 (날짜 기준)" 를 오늘로 동기화** (안 하면 Doc Lint FAIL)

5. **CLAUDE.md 갱신** — 완료 스프린트 테이블에 **1줄만** 추가

6. **harness 실행** — `python scripts/harness.py all` → 결과 보고

## Constraints
- _GUIDE.md 내용 재작성 금지 (사고 이력은 보존 자산)
- DEV_GUIDE.md 임의 수정 금지
- 기존 아카이브 파일 삭제 금지
- CLAUDE.md 에 상세 bullet 추가 금지 — 1줄 테이블 행만
- harness 실패 시 클로즈아웃 완료 선언 금지
- Final Gate 미완료 시 클로즈아웃 완료 선언 금지
