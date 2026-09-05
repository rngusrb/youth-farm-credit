# API 데이터 출처

서비스에서 사용하는 외부 API와 용도를 정리한 문서입니다. 인증키 원문은 저장소에 기록하지 않고 `apps/api/.env`의 환경변수로만 관리합니다.

| 서비스 | 엔드포인트 | 용도 | 인증키 환경변수 |
| --- | --- | --- | --- |
| 한국농수산식품유통공사 전국 공영도매시장 실시간 경매정보 | `https://apis.data.go.kr/B552845/katRealTime2/trades2` | 최근 낙찰가·일별 경매 흐름 | `DATA_GO_KR_API_KEY` |
| 한국농수산식품유통공사 일별 도·소매 가격정보 | `https://apis.data.go.kr/B552845/perDay/price` | 일별 가격·월별 평균 가격 | `DATA_GO_KR_SERVICE_KEY` 또는 `DATA_GO_KR_API_KEY` |
| 한국농수산식품유통공사 연월별 도·소매 가격정보 | `https://apis.data.go.kr/B552845/perYearMonth/price` | 연도·월별 가격 비교 (`pmm_avgprc` 등) | `DATA_GO_KR_API_KEY` |
| 한국농수산식품유통공사 최근일자 도·소매 가격정보 | `https://apis.data.go.kr/B552845/recent/price` | 최근 가격·전일·전년 비교 (`exmn_dd_cnvs_prc` 등) | `DATA_GO_KR_API_KEY` |
| 한국농수산식품유통공사 전국 공영도매시장 경매원천정보 | `https://apis.data.go.kr/B552845/katOrigin/trades` | 거래정산일자·물량(`qty`)·낙찰 원자료 | `DATA_GO_KR_API_KEY` |
| 한국농수산식품유통공사 농축수산물 표준코드 | `https://apis.data.go.kr/B552845/katCode/goods` | 작목의 대분류·중분류·소분류 코드 매핑 | `DATA_GO_KR_API_KEY` |
| 농산물 시장 코드 목록 | `https://api.agromarket.kr/samples/public/katCode/wholesalemarkets` | 전국 도매시장 코드·명칭 조회 | 공개 샘플 API |

## 현재 주요 조회 조건

- 딸기 서울가락: `cond[whsl_mrkt_cd::EQ]=110001`
- 딸기 대분류(과일과채류): `cond[gds_lclsf_cd::EQ]=08`
- 딸기 중분류: `cond[gds_mclsf_cd::EQ]=04`
- 거래정산일자 범위: `cond[trd_clcln_ymd::GTE]`, `cond[trd_clcln_ymd::LTE]` (`YYYY-MM-DD`)
- 물량 컬럼: `qty` (없을 때 `unit_tot_qty`를 참고)

표준코드 API의 실제 엔드포인트, 오퍼레이션명, 응답 컬럼 명세를 받으면 위 표와 코드 매핑을 갱신합니다.

## 로컬 실행

1. `apps/api/.env.example`을 `apps/api/.env`로 복사합니다.
2. 발급받은 일반 인증키(Encoding 또는 Decoding)를 `DATA_GO_KR_API_KEY`에 입력합니다.
3. API 실행: `cd apps/api && .venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000`
4. 웹 실행: `cd apps/web && npm install && npm run dev`

웹은 기본적으로 `http://127.0.0.1:8000` API를 사용합니다. 인증키 원문은 보안을 위해 저장소에 커밋하지 않습니다.
