---
name: task-start
description: |
  Use this when beginning work on a new task from TASKS.md or BACKLOG.md.
  Triggers on: "시작할게", "태스크 시작", "이거 해줘" (with a specific task),
  or picking up a new task after the previous one completed.
---

# Task Start Skill

## Goal
태스크 시작 전 컨텍스트를 로드하고 현재 상태를 파악한다.
**"일단 시작하고 나중에 읽기" 패턴을 방지한다.**

## Instructions

1. **태스크 확인**
   - TASKS.md 에서 해당 태스크의 설계 구상 / 제약사항 읽기
   - 관련 파일 목록 파악

2. **아키텍처 컨텍스트 로드**
   - DEV_GUIDE.md 관련 섹션
   - 수정할 폴더의 `_GUIDE.md` — **금지사항 필수 확인**

3. **baseline 파악**
   ```
   python scripts/harness.py {folder}/
   ```
   - 현재 통과 테스트 수 기록
   - **기존 실패가 있으면 먼저 보고** (내 변경 탓으로 오인하지 않기 위해)

4. **작업 프로토콜 결정**

   | 분류 | 기준 | 프로토콜 |
   |------|------|---------|
   | 단순 | 단일 파일, 버그픽스, 2~3줄 | CLAUDE.md 단순 프로토콜 |
   | 복잡 | 신규 모듈, 여러 폴더, 구조 변경 | **maker-review-loop 적용** |

   복잡으로 분류되면:
   - TASKS.md 에 `### Reviewer Findings` + `### Final Gate` 필드 추가
   - "이 태스크는 maker-review-loop 적용 — Reviewer PASS 없이 sprint-close 불가" 명시

5. **시작 전 체크리스트 보고**
   - 관련 금지사항 요약 / 수정할 파일 목록 / baseline 테스트 수 / 단순·복잡 분류

## Constraints
- _GUIDE.md 읽기 전에 코드 수정 시작 금지
- baseline harness 실행 전에 코드 수정 시작 금지
- 복잡 태스크에서 maker-review-loop 없이 구현 시작 금지
