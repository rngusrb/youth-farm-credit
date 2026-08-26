# 0001 — 순수 추정기는 core 에 둔다

- **날짜**: 2026-08-26
- **상태**: 확정
- **발단**: 하네스 설치 직후 `deps_check` 가 `apps/api/engine/diagnose.py:130` 에서
  `core → adapters` 금지 위반을 잡았다. `from stats.shrinkage import explain, shrink`.

## 무엇이 문제였나

`diagnose.py` 는 이 import 를 **함수 안에 숨겨** 두고 있었다. 최상단에 두면 어색하다는
감각이 있었다는 뜻이고, 그 감각이 맞았다. 진짜 원인은 순환참조도 성능도 아니라
`shrinkage.py` 가 **어댑터가 아닌데 adapters 폴더에 있었다**는 것이다.

`stats/` 를 전수 조사하니 두 종류가 섞여 있었다.

| 종류 | 모듈 | 외부 I/O |
|---|---|---|
| 순수 수학 | garch, hierarchical, leverage, shrinkage, volatility | 0 |
| 진짜 어댑터 | env, kamis, kosis, **factors** | requests·os·파일 |
| 수집 CLI | calibrate, calibrate_kosis, calibrate_market, expand_crops | 있음 |

## 결정

순수 5개를 `apps/api/estimators/` 로 옮기고 **core 레이어**에 등록했다.
`diagnose.py` 의 지연 import 는 최상단으로 올렸다 — 숨길 이유가 사라졌다.
분류 기준은 한 줄이다: **데이터를 가져오면 adapters, 받은 배열로 계산만 하면 core.**

### 옮기려다 되돌린 것 — `factors.py`

처음엔 순수로 분류했다. `import requests` 도 `import os` 도 없었기 때문이다.
옮기고 나서 테스트가 `No module named 'estimators.kosis'` 로 깨졌다 —
`from .kosis import IncomeRow, series_for` 라는 **상대 import** 를 쓰고 있었다.
grep 이 `stats.kosis` 를 찾을 때 `.kosis` 는 안 걸린다.

교훈: 순수성 판정은 `import` 문 문자열이 아니라 **실제 임포트 그래프**로 해야 한다.
`deps_check` 가 이걸 잡아주는 이유가 여기 있다. `factors.py` 는 KOSIS 행 타입을
소비하는 수집 파이프라인의 일부이므로 adapters 가 맞다.

## 안 하기로 한 것

- **`core: [adapters]` 를 허용해서 위반을 없애기.**
  한 줄이면 끝나지만, 그 순간 "core 는 인터넷 없이 전부 테스트된다"는 성질이 규칙에서
  사라진다. 이 프로젝트에서 그 성질은 편의가 아니라 **"숫자는 LLM 이나 외부 API 가
  만들지 않는다"는 주장의 기계적 증거**다. 심사에서 이걸 물으면 보여줄 게 필요하다.
  위반 1건 때문에 증거를 버리는 거래는 성립하지 않는다.
- **`estimators/` 를 `engine/` 안에 넣기.**
  경계 설정을 안 건드려도 됐지만, `engine/` 은 여신 도메인(상환·DSCR·한도)이고
  추정기는 도메인 무관 통계다. 섞으면 `engine/_GUIDE.md` 가 두 가지를 설명하게 된다.
  형제 패키지로 두면 폴더 이름 자체가 분류 기준을 설명한다.
- **`stats/` 를 통째로 core 로 올리기.**
  kamis·kosis 는 네트워크를 탄다. 진짜 어댑터다.

## 결과

`deps_check` 위반 0건. `harness all` 통과. 178 테스트 전부 통과 (개수 변화 없음).
