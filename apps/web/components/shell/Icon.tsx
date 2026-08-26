/** 메뉴 아이콘. 이모지는 쓰지 않는다 — 폰트에 따라 제각각 렌더된다. */
const PATHS: Record<string, string> = {
  grid:   "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  gauge:  "M12 13a1 1 0 100-2 1 1 0 000 2zM12 12l4.5-4.5M4 18a9 9 0 1116 0",
  doc:    "M7 3h7l4 4v14H7zM14 3v4h4M10 12h6M10 16h6",
  sprout: "M12 21v-7M12 14c0-3-2-5-5-5 0 3 2 5 5 5zM12 14c0-3 2-5 5-5 0 3-2 5-5 5z",
  table:  "M4 5h16v14H4zM4 10h16M4 15h16M10 5v14",
  chart:  "M4 19h16M6 15l4-5 3 3 5-7",
  book:   "M5 4h9a3 3 0 013 3v13H8a3 3 0 01-3-3zM17 7H8",
  chat:   "M5 5h14v10H9l-4 4z",
};

export default function Icon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[name] ?? PATHS.grid} />
    </svg>
  );
}
