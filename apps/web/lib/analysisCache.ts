"use client";

/** 심사 화면 결과 캐시 — 같은 차주·같은 조건이면 다시 계산하지 않는다.
 *
 * ## 왜 있나
 *
 * 사고 이력 2026-09-07: 심사 화면 셋이 열릴 때마다 진단부터 다시 계산했다.
 * 다른 화면 잠깐 보고 돌아오면 컴포넌트가 remount 되어 **또 처음부터** 돌았다.
 * stress 는 시나리오 6개 × 몬테카를로라 몇 초 걸리고, Render 무료 플랜은
 * 15분 놀면 잠들어 첫 요청이 더 걸린다. 심사역이 화면을 오갈 때마다 기다렸다.
 *
 * ## 무엇을 캐시하나
 *
 * **키에 조건을 전부 넣는다.** 차주가 바뀌거나 금액을 바꾸면 키가 달라져 다시 계산한다.
 * 조건을 키에서 빠뜨리면 바뀐 조건에 옛 결과를 보여주게 된다 — 그게 제일 나쁘다.
 *
 * 메모리에만 둔다. 새로고침하면 사라진다 — 계산 결과는 저장 대상이 아니고,
 * localStorage 에 넣으면 옛 코드가 만든 결과가 새 코드 화면에 뜬다.
 */
const store = new Map<string, unknown>();

/** 같은 키로 이미 부른 적 있으면 그 약속을 그대로 돌려준다(중복 호출도 막는다). */
export function cached<T>(key: string, run: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit) return hit as Promise<T>;
  const p = run().catch((e) => {
    // 실패는 캐시하지 않는다 — 다음에 다시 시도할 수 있어야 한다.
    store.delete(key);
    throw e;
  });
  store.set(key, p);
  return p;
}

/** 차주가 바뀌었거나 조건을 손으로 고쳤을 때 비운다. */
export function clearAnalysisCache(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k);
}
