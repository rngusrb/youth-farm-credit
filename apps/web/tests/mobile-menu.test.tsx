import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Header from "@/components/gov/Header";
import WorkChrome from "@/components/gov/WorkChrome";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/map",
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/lib/useSession", () => ({
  useSession: () => ({ ready: true, session: { role: "farmer", name: "테스트", org: "농가" } }),
}));

describe("좁은 화면의 펼침 메뉴", () => {
  it("업무 메뉴는 펼쳐서 이동할 수 있고 선택 후 닫힌다", () => {
    render(<WorkChrome><p>자금지도 본문</p></WorkChrome>);
    const nav = within(screen.getByRole("navigation", { name: "업무 메뉴 (모바일)" }));
    const toggle = nav.getByRole("button");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(nav.queryByRole("link", { name: "AI 농가 상담사" })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(nav.getByRole("link", { name: "AI 농사 자금지도" })).toHaveAttribute("aria-current", "page");
    const link = nav.getByRole("link", { name: "AI 농가 상담사" });
    expect(link).toHaveAttribute("href", "/app/assistant");
    fireEvent.click(link);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("자금지도 본문")).toBeVisible();
  });

  it("공개 메뉴의 자료실도 펼쳐서 접근할 수 있다", () => {
    render(<Header />);
    const nav = within(screen.getByRole("navigation", { name: "주요 메뉴 (모바일)" }));
    const toggle = nav.getByRole("button");
    expect(nav.queryByRole("link", { name: "자료실" })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(nav.getByRole("link", { name: "자료실" })).toHaveAttribute("href", "/library");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});
