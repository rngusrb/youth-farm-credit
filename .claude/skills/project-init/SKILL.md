---
name: project-init
description: |
  Use this at the very start of a new web project, before writing feature code.
  Triggers on: "새 프로젝트 시작", "설계부터", "뼈대 잡아줘", empty repository,
  or any request to build an application from scratch.
---

# Project Init Skill (0단계)

## Goal
**코드를 쓰기 전에 경계를 선언하고, 그 선언이 맞는지 한 번 관통해서 확인한다.**

0단계가 필요한 이유: 프로젝트 초기엔 사고가 없어서 규칙도 없다. 그런데
**가장 비싼 결정이 이때 내려진다.** 여기서 정한 게 문서에 안 남으면 다음 세션이 다른 방식으로 짜고,
팀원은 더 모르고, 3개월 뒤엔 경계가 뭉개진다.

> ⚠️ **문서 4개 만들고 "설계 끝"이라고 하지 않는다.** 완료 기준은 ⑤ 수직 관통이다.

## 순서

### ① 경계 선언 → `meta/boundaries.yaml`
- 레이어 **3개 이내** (기본: api / core / adapters). 늘리고 싶으면 사람에게 묻는다
- 각 레이어의 `owns` 보다 **`never` 를 먼저 적는다** — 월권이 대부분의 붕괴 원인이다
- `allowed_imports` 로 의존 방향 명시. **core → adapters 를 허용할지 결정하고 이유를 ②에 기록**
- 초기 기능 3~5개를 `features` 에

### ② 설계 결정 기록 → `docs/decisions/`
결정당 짧게. **반드시 "안 하기로 한 것" 칸을 채운다.**
```
결정:            레이어 3개 (api/core/adapters)
왜:              ...
안 하기로 한 것:  레이어 추가 분할(repository·usecase) — 기능당 이동 폴더가 늘어남
```
이유: 몇 세션 뒤 깨끗한 컨텍스트로 보면 그 분할이 다시 좋아 보인다. **기각 이력이 없으면
같은 논쟁을 반복한다.**

### ③ 경계 규칙의 기계 번역
- 레이어마다 `_GUIDE.md` 배치 (`ext-web/templates/_GUIDE.{api,core,adapters}.md`)
- 각 `never` 항목을 **`boundaries.yaml` 의 `forbidden_symbols`** 에 (레이어 전체 규칙의 소유자)
- ```gc 블록엔 **그 폴더에만 해당하는 것**만 — 같은 규칙을 두 곳에 적으면 갈라진다
- `python scripts/deps_check.py` 통과 확인
- ⚠️ 레이어 `_GUIDE.md` 의 `## 하네스` 목록은 **앞으로 만들 테스트 파일**을 적는 자리다.
  아직 없는 파일이 적혀 있으면 `harness all` 이 정직하게 FAIL 한다 — 파일을 만들거나 목록에서 지운다

### ④ 검증 배선
- `tests/invariants/test_core_is_pure.py` 배치 (core 순수성)
- `tests/contract/` 에 외부 호출 계약 테스트 (실제 API 부르지 않음)
- `meta/project_state.yaml` 의 `loop.metrics` 에 `deps: "python scripts/deps_check.py --count"`

### ⑤ 수직 관통 — **여기까지가 0단계다**
가장 단순한 기능 하나를 `api → core → adapters` 전 레이어로 뚫는다.
**끝을 어디로 볼지는 배포 대상 유무로 갈린다:**
- 배포처가 이미 있으면 → 거기까지 올려서 실제로 돌린다
- 아직 없으면 → **전 레이어를 지나는 통합 테스트 1개 + 로컬 실행 확인**까지.
  배포는 배포처가 생겼을 때 별도로 (그게 없다고 0단계를 미루지 않는다)

여기서 대부분의 설계 오류가 즉시 드러난다 — 인증을 어디서 처리할지, 에러를 어느 레이어에서
잡을지, 트랜잭션 경계가 어딘지. 문서로는 절대 안 나오고 한 번 뚫으면 30분이면 나온다.

### ⑥ 팀 승인
0단계 산출물은 **PR 로 팀 승인을 받는다.** 혼자 정하고 3주 진행하면 나중에 뒤집히고,
그때 비용이 가장 크다.

## Constraints
- 레이어 4개 이상을 **혼자 결정하지 않는다** (사람에게 확인)
- `shared/` 를 만들 거면 입장 조건을 `boundaries.yaml` 에 같이 못 박는다
- ⑤ 없이 "설계 완료" 선언 금지
- 경험 규칙(사고에서 오는 것)을 미리 쓰지 않는다 — 0단계에 쓰는 건 **경계 규칙**뿐이다
