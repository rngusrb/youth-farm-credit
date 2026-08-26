# DEV_GUIDE — 코드 작성 참고서

> 코드 수정 전 읽는 문서. CLAUDE.md(원칙)와 달리 여기엔 **실제 수정 절차와 지도**가 있다.

## ★ 대규칙 — 모든 작업에 적용

```
1. 작업 전  → 해당 폴더 _GUIDE.md 확인
2. 작업 전  → harness 로 현재 상태 파악 (baseline)
              python scripts/harness.py <폴더>/
3. 코드 수정
4. 작업 후  → harness 재실행
5. 실패 시  → 원인 → 수정 → 4번으로 (같은 실패 2회 연속이면 중단·보고)
6. 통과 시  → _GUIDE.md ## 금지사항에 새 패턴 추가 (사고 이력 포함)
              → 6번 전까지 "완료" 선언 금지
7. GC 체크  → python scripts/harness.py <폴더>/ --gc
```

**6번이 핵심.** 같은 실수가 반복되는 유일한 이유는 규칙이 안 쌓였기 때문이다.

> ⚠️ 문서 업데이트 원칙: **실제 변경(버그 수정·규칙 추가·파일 추가)이 있을 때만** 갱신.
> 점검만 한 경우, 확인만 한 경우 갱신 금지 — 불필요한 갱신이 반복되면 변경 추적이 불가능해진다.

---

## 시스템 지도

```
(레이어 다이어그램. 의존 방향을 화살표로 명시. 한 화면에 들어오게.)
```

### 실행 경로

| 진입점 | 경로 | 형태 |
|--------|------|------|
| ... | `...` | ... |

---

## "X를 바꾸려면 어디 봐라" 색인

> 이 표가 이 문서의 존재 이유다. 새 사람(또는 새 세션)이 5초 만에 파일을 찾게 한다.

| 바꾸려는 것 | 봐야 할 파일 |
|------------|------------|
| ... | `...` |

---

## 전역 금지사항

> 폴더 하나에 국한되지 않는 규칙만. 폴더 한정 규칙은 각 _GUIDE.md 로.

### 1. {규칙}
```python
# ❌ 금지
# ✅ 대신
```
**사고 이력**: ...

---

## 폴더별 _GUIDE.md 위치

| 폴더 | 가이드 |
|------|--------|
| `src/` | `src/_GUIDE.md` |

---

## 새 클론 온보딩

```bash
sh scripts/install_git_hooks.sh   # 커밋 시 harness all 강제
sh scripts/verify.sh              # 완료 검증 단일 명령
```

---

## harness 사용법

```bash
python scripts/harness.py src/          # 폴더 단위
python scripts/harness.py src/x.py      # 파일 단위
python scripts/harness.py src/ --gc     # + 정적 검사
python scripts/harness.py src/ --diff   # 직전 대비 신규 실패만
python scripts/harness.py all           # 전체 + Doc Lint
```

*마지막 갱신: YYYY-MM-DD — (무엇이 바뀌었는지)*
