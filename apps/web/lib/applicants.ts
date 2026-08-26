/** 심사 대기 차주 목록 (금융기관 화면).
 *
 * 서버도 DB도 없으므로 **실제 신청 건이 존재하지 않는다.** 그렇다고 가짜 심사
 * 결과를 지어내면 화면 전체가 거짓이 된다. 그래서 이렇게 나눴다.
 *
 *   신원(이름·지역·신청일)  → 예시다. 화면에 '예시' 라고 명시한다.
 *   경영 조건(작목·면적·부채) → 예시 입력값이다.
 *   **모든 금액·확률·판정**   → 예시 조건을 엔진에 넣어 **실제로 계산한 값**이다.
 *
 * 즉 "이런 농가가 신청하면 심사역 화면에 이렇게 뜬다" 를 보여주는 것이고,
 * 숫자 자체는 조작되지 않았다. 실제 서비스에서는 이 목록이 신청 DB 로 바뀐다.
 */
export type Applicant = {
  ref: string;          // 접수번호
  name: string;         // 예시 신원
  region: string;
  appliedOn: string;
  cropId: string;
  pyeong: number;
  livingCost: number;
  otherDebtService: number;
  requested: number;    // 신청 금액
  productId: string;
  incomeHistory: number[];
};

const MAN = 10_000;

/** 서로 다른 판정이 나오도록 조건을 흩어 놓았다 — 전부 통과하면 화면이 아무 말도 안 한다. */
export const APPLICANTS: Applicant[] = [
  {
    ref: "2026-0417", name: "김청년", region: "충남 논산", appliedOn: "2026-08-12",
    cropId: "strawberry_hydro", pyeong: 1200, livingCost: 3000 * MAN,
    otherDebtService: 0, requested: 30000 * MAN, productId: "successor_farmer",
    incomeHistory: [],
  },
  {
    ref: "2026-0421", name: "이서준", region: "전북 김제", appliedOn: "2026-08-13",
    cropId: "greenhouse_tomato", pyeong: 3000, livingCost: 2400 * MAN,
    otherDebtService: 0, requested: 20000 * MAN, productId: "successor_farmer",
    incomeHistory: [4200 * MAN, 3800 * MAN, 5100 * MAN, 4400 * MAN],
  },
  {
    ref: "2026-0433", name: "박도현", region: "경북 상주", appliedOn: "2026-08-14",
    cropId: "field_carrot", pyeong: 6000, livingCost: 2400 * MAN,
    otherDebtService: 600 * MAN, requested: 15000 * MAN, productId: "successor_farmer",
    incomeHistory: [],
  },
  {
    ref: "2026-0440", name: "최유진", region: "전남 나주", appliedOn: "2026-08-18",
    cropId: "greenhouse_cucumber", pyeong: 2000, livingCost: 3600 * MAN,
    otherDebtService: 0, requested: 20000 * MAN, productId: "excellent_successor",
    incomeHistory: [],
  },
  {
    ref: "2026-0448", name: "정하늘", region: "강원 평창", appliedOn: "2026-08-20",
    cropId: "field_highland_napacabbage", pyeong: 12000, livingCost: 2400 * MAN,
    otherDebtService: 0, requested: 25000 * MAN, productId: "successor_farmer",
    incomeHistory: [],
  },
];

export const findApplicant = (ref: string): Applicant | undefined =>
  APPLICANTS.find((a) => a.ref === ref);
