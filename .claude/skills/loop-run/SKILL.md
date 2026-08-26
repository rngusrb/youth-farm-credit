---
name: loop-run
description: |
  Use this for tasks where progress is measurable as a number and needs several rounds:
  failing tests to zero, type errors, lint violations, refactoring, migration, performance.
  Triggers on: "루프 돌려", "수렴시켜", "0 될 때까지", "반복해서 고쳐",
  or any task with a countable backlog of the same kind of problem.
---

# Loop Run Skill

## Goal
측정 → 체크포인트 → 판정 → 되돌리기 → 정지를 강제한다.
**에이전트가 스스로 "좋아졌다"고 판단하지 않는다.** 판정은 `loop.py` 가 한다.

## 쓸 때 / 쓰지 말 때

| 쓴다 | 안 쓴다 |
|------|--------|
| 실패 테스트 N개 → 0 | 버그 하나 고치기 (이진, 루프 불필요) |
| 타입/린트 위반 정리 | **설계 결정이 필요한 일** (탐색은 사람이) |
| 리팩터링 (중복·복잡도) | **되돌릴 수 없는 작업** ← 절대 금지 |
| 마이그레이션 (남은 파일 수) | 점수를 정의할 수 없는 일 |
| 성능 (응답시간·번들 크기) | |

> ⚠️ **되돌릴 수 없는 작업엔 절대 쓰지 않는다** — 배포, DB 마이그레이션 실행,
> 외부 API 호출, 파일 삭제. 이 루프의 안전장치는 전부 `git reset` 에 기대고 있다.

## 실행 순서

```bash
python scripts/loop.py start "<목표 한 줄>"   # 기준선 측정
```

그다음 매 라운드:

1. **한 가지만 고친다** — 여러 개를 한 번에 고치면 뭐가 효과였는지 모른다
2. `python scripts/loop.py round`
3. 판정에 따른다

| 판정 | 코드 | 행동 |
|------|------|------|
| CONTINUE | 0 | 새 기준선. 다음 문제로. |
| REVERTED | 0 | 이미 되돌려졌다. **같은 방법 반복 금지** — 다른 접근으로. |
| STOP | 3 | 정체/상한/달성. **사람에게 보고하고 멈춘다.** |
| HACK | 4 | 점수 해킹 감지. 즉시 멈추고 보고. |

```bash
python scripts/loop.py stop     # 요약
```

## 금지사항

- **테스트를 지우거나 skip 해서 점수를 올리지 않는다.** `loop.py` 가 테스트 수 감소를
  감지하면 되돌리고 정지한다(HACK). 정당하게 지워야 하면 루프를 멈추고 사람에게 묻는다.
- **판정을 스스로 내리지 않는다.** "좋아진 것 같다"는 판정이 아니다. `round` 를 부른다.
- **STOP 을 무시하고 계속하지 않는다.** 정체는 접근이 틀렸다는 신호다.
- **루프 도구 자체를 루프 중에 수정하지 않는다** — `reset --hard` 가 그 수정까지 되돌린다.
- 한 라운드에 여러 문제를 동시에 건드리지 않는다.

## 정체(STOP)했을 때 보고할 것

- 몇 라운드에서 멈췄고 점수가 어디서 굳었는지
- 시도한 접근들 (`.loop/rounds.jsonl` 의 why 필드)
- 왜 안 통한다고 보는지 — **접근을 바꿀 제안 1~2개**
