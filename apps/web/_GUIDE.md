# apps/web — 웹 서비스 (Next.js App Router)

대시보드형 제품이다. **여신 진단은 이 제품의 기능 하나**이지 제품 전체가 아니다.
새 기능을 붙일 때 리포트 화면을 늘리지 말고 라우트를 하나 더 만든다.

## 라우트 지도

| 경로 | 화면 | 데이터 출처 |
|---|---|---|
| `/` | 대시보드 — 상환위험·내농가·시장국면·제도근거를 한 화면에 | 매 진입마다 `/diagnose` 재계산 |
| `diagnose` | 진단 입력 | `/api/v1/extract`, `/api/v1/diagnose` |
| `result/[id]` | 리포트 (문서 화면, 사이드바 없음) | `/api/v1/diagnose/{id}` |
| `reports` | 이 브라우저에 남은 리포트 목록 | localStorage |
| `farm` | 내 농가 기본값 설정 | localStorage + `/api/v1/crops`,`/products` |
| `crops` | 38작목 σ·요인·측정등급 표 | `/api/v1/crops` |
| `market` | KAMIS 도매가 국면·교차검증·수확기 | `/api/v1/crops/{id}` |
| `policy` | 시행지침 원문 검색 | `/api/v1/regulation/ask` |
| `assistant` | 계산 질문과 제도 질문을 갈라 처리 | extract → diagnose 또는 regulation |

## 금지사항

- **`limits.recommended` 를 "감당 가능한 금액" 이라고 부르지 않는다.** 셋의 뜻이 다르다.
  `available`=제도 한도, `recommended`=DSCR 1.25(소득이 **안 흔들린다는 가정**),
  `risk_based`=위기확률 기준(변동을 넣고 시뮬레이션). 대표 금액은 항상 `risk_based` 다.
  대시보드가 이걸 헷갈려 위기확률 64.9% 짜리 금액을 '감당 가능' 으로 띄운 적이 있다 —
  `lib/diagnosis.ts` 의 `headlineLimit()` 만 쓰고 직접 필드를 꺼내지 않는다.
- **화면에서 숫자를 계산하지 않는다.** 합계·비율·한도는 전부 API 응답을 그대로 쓴다.
  프런트에서 한 번이라도 계산하면 리포트와 대시보드의 숫자가 갈라지고, 어느 쪽이
  맞는지 아무도 모르게 된다.
- **빈 메뉴를 만들지 않는다.** `lib/nav.ts` 에 올리는 항목은 반드시 실제 데이터가
  있어야 한다. 목업에 있던 '기상 위험'·'보험'을 뺀 이유가 이것이다
  (기상 관측 자료 없음, 보험료율 미공개).
- **로그인·서버 저장을 넣지 않는다.** 진단 입력은 문서번호(URL)에 인코딩돼 있고
  개인 기본값은 localStorage 에 있다. 서버로 개인정보를 보내지 않는다.
- 리포트(`.sheet`)와 대시보드는 **색계가 다르다**. 리포트는 종이, 대시보드는 앱이다.
  한쪽 컴포넌트를 다른 쪽에 그대로 쓰면 대비가 깨진다 (실제로 깨진 적 있다).

## 하네스

```
apps/web/tests/nav.test.ts
apps/web/tests/format.test.ts
apps/web/tests/profile.test.ts
apps/web/tests/diagnosis.test.ts
```
