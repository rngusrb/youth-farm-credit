"""engine/errors.py — core 가 던지는 도메인 예외.

core 는 HTTP 를 모른다. 그래서 상태코드가 아니라 의미로 실패를 알리고,
api 레이어가 그것을 상태코드로 번역한다 (apps/api/_GUIDE.md 의 규칙).
"""
from __future__ import annotations


class InsufficientCropData(ValueError):
    """작목에 계산에 필요한 데이터(총수입·경영비 등)가 없다.

    지어내지 않고 실패한다 — 없는 값을 추정해 넣으면 결과가 조용히 틀린다.
    """

    def __init__(self, crop_name: str, missing: str) -> None:
        self.crop_name, self.missing = crop_name, missing
        super().__init__(f"{crop_name}은(는) {missing}이(가) 없어 계산할 수 없습니다")


class InsufficientRepaymentCapacity(ValueError):
    """소득에서 생활비·기존부채를 빼면 상환에 쓸 돈이 남지 않는다.

    이건 데이터 부족이 아니라 **계산 결과**다. 진단은 이 경우 limits 를 축약해
    돌려주는데, 그걸 모르는 호출부가 키를 그대로 읽어 KeyError 를 냈고 api 가
    404 로 번역하면서 파이썬 키 이름이 응답에 새어 나갔다 (2026-09-02).
    의미로 실패해야 api 가 사람이 읽을 말로 옮길 수 있다.
    """
