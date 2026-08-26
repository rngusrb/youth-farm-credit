# estimators/ — 순수 추정기 (core 레이어)

통계 추정만 한다. **외부 I/O 0, 환경변수 0, 파일 접근 0.**
`stats/` 와 헷갈리기 쉬운데 기준은 하나다 — 데이터를 **가져오면** `stats/`(adapters),
받은 배열로 **계산만 하면** 여기다.

## 모듈 지도 — core — 순수 추정기

| 모듈 | 역할 |
|---|---|
| `volatility.py` | 로그수익률·연율화·부트스트랩 CI·계절조정 |
| `shrinkage.py` | 개인 소득이력 계층적 축소추정 (경험적 베이즈) |
| `hierarchical.py` | 작목 층위 부분 풀링. 표본 적은 작목을 전체 분포로 당긴다 |
| `leverage.py` | 영업레버리지(DOL)·분산분해 |
| `garch.py` | GARCH(1,1)·연평균 변동성·계절 공백 처리 |

## 규칙

- `import requests`, `import os`, `open()` 이 여기 들어오면 **파일이 잘못 놓인 것**이다.
  가져오는 코드는 `stats/` 로 간다.
- 모든 함수는 numpy 배열 in / dataclass out. 전역 상태 금지.
- `engine/` 이 여기를 부르는 건 정상이다 (core 내부).

## 하네스

```
apps/api/tests/test_stats.py
apps/api/tests/test_personalization.py
```
