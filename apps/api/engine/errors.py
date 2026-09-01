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
