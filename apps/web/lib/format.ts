/** 표시 규칙 (§7.3): 확률은 소수점 1자리, 금액은 만원 단위 3자리 구분. */

export function won(value: number): string {
  const sign = value < 0 ? "-" : "";
  const v = Math.abs(Math.round(value));
  const eok = Math.floor(v / 100_000_000);
  const man = Math.round((v - eok * 100_000_000) / 10_000);
  if (eok && man) return `${sign}${eok}억 ${man.toLocaleString("ko-KR")}만원`;
  if (eok) return `${sign}${eok}억원`;
  if (man === 0) return "0원";
  return `${sign}${man.toLocaleString("ko-KR")}만원`;
}

export function manwon(value: number): string {
  return `${Math.round(value / 10_000).toLocaleString("ko-KR")}만원`;
}

export function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function pyeong(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}평`;
}

export function ratio(value: number): string {
  return value.toFixed(2);
}
