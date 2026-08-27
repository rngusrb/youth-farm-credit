/**
 * 접기 컴포넌트 (UX-001).
 *
 * 지키려는 것: **지우지 않고 접는다.** 요약은 항상 보이고, 근거는 DOM 에 남아 있다.
 * 세 팀원 모두 "정보량이 많다"고 했지만 동시에 세 명 모두 "근거가 설득력 있다"고
 * 했다 — 지우면 후자를 잃는다.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Fold from "../components/Fold";

describe("Fold", () => {
  it("기본은 접혀 있고, 요약은 보인다", () => {
    const { container } = render(
      <Fold summary="계산 전제">
        <p>재해확률 8% 가정</p>
      </Fold>,
    );
    const d = container.querySelector("details");
    expect(d?.open).toBe(false);
    expect(screen.getByText("계산 전제")).toBeTruthy();
  });

  it("접어도 근거를 지우지 않는다 — DOM 에 남는다", () => {
    render(
      <Fold summary="계산 전제">
        <p>재해확률 8% 가정</p>
      </Fold>,
    );
    expect(screen.getByText("재해확률 8% 가정")).toBeTruthy();
  });

  it("<details> 를 쓴다 — 키보드·스크린리더 동작을 직접 만들지 않는다", () => {
    const { container } = render(<Fold summary="근거">x</Fold>);
    expect(container.querySelector("details > summary")).toBeTruthy();
  });

  it("open 을 주면 펼친 채로 시작한다", () => {
    const { container } = render(<Fold summary="근거" open>x</Fold>);
    expect(container.querySelector("details")?.open).toBe(true);
  });
});
