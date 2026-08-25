"use client";

import CliffChart from "./CliffChart";

/**
 * 랜딩용 절벽 차트. 케이스 A(딸기 1,000평·한도 5억)의 엔진 산출값을 그대로 박아둔다.
 * 랜딩은 계산 화면이 아니라 문제 제시 화면이므로 API 를 호출하지 않는다.
 */
const GRACE = 7_500_000;
const AMORT = 29_122_868;
const CAPACITY = 24_495_868;
const SCHEDULE = [
  ...Array(5).fill(GRACE),
  ...Array(20).fill(AMORT),
];

export default function LandingCliff() {
  return (
    <CliffChart
      schedule={SCHEDULE}
      capacity={CAPACITY}
      graceYears={5}
      firstRiskYear={6}
      height={300}
    />
  );
}
