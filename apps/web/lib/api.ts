export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";

export type AuctionItem = {
  market: string;
  item: string;
  price: number | null;
  unit: string;
  quantity?: string | number | null;
  auction_at: string;
  previous_day_price?: number | null;
  seven_day_price?: number | null;
  month_price?: number | null;
  year_price?: number | null;
};

export type RealtimeAuction = {
  status: "ok" | "empty" | "unavailable";
  source?: string;
  as_of?: string;
  crop?: string | null;
  match_level?: string;
  average_price?: number | null;
  average_label?: string | null;
  message?: string;
  items: AuctionItem[];
  daily_series?: { date: string; price: number; count: number }[];
};

export async function fetchRealtimeAuction(cropId?: string, limit = 5, series = true): Promise<RealtimeAuction> {
  const query = new URLSearchParams({ limit: String(limit) });
  query.set("series", String(series));
  if (cropId) query.set("crop_id", cropId);
  const res = await fetch(`${API_BASE}/api/v1/auction/realtime?${query}`, { cache: "no-store" });
  if (!res.ok) throw new Error((await res.text()) || "경매가를 불러오지 못했습니다");
  return res.json();
}
export async function fetchMarketRecent(cropId: string, limit = 5): Promise<RealtimeAuction> {
  const res = await fetch(`${API_BASE}/api/v1/market/recent?crop_id=${encodeURIComponent(cropId)}&limit=${limit}`, { cache: "no-store" });
  if (!res.ok) throw new Error("최근 도매가를 불러오지 못했습니다");
  return res.json();
}

export type MarketCompareItem = { item: string; market: string; date: string; price: number | null; previous_day_price: number | null; seven_day_price?: number | null; month_price?: number | null; year_price: number | null; year_change?: string | number | null; grade?: string; unit?: string; unit_qty?: string };
export type MarketCompare = { status: "ok" | "empty" | "unavailable"; crop?: string | null; items: MarketCompareItem[] };
export async function fetchMarketCompare(cropId?: string): Promise<MarketCompare> {
  const query = cropId ? `?crop_id=${encodeURIComponent(cropId)}` : "";
  const res = await fetch(`${API_BASE}/api/v1/market/compare${query}`, { cache: "no-store" });
  if (!res.ok) throw new Error("공판장 가격을 불러오지 못했습니다");
  return res.json();
}
export type QuarterlyMarket = { status: "ok" | "empty" | "unavailable"; crop?: string; items: { year: number; month: number; price: number; days?: number; high?: number | null; low?: number | null; stddev?: number | null; cv?: number | null; range_cv?: number | null }[]; message?: string };
export async function fetchMarketQuarterly(cropId: string): Promise<QuarterlyMarket> {
  const res = await fetch(`${API_BASE}/api/v1/market/quarterly?crop_id=${encodeURIComponent(cropId)}`, { cache: "no-store" });
  if (!res.ok) throw new Error("분기별 가격을 불러오지 못했습니다");
  return res.json();
}
export async function fetchMarketMonthly(cropId: string): Promise<QuarterlyMarket> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/market/monthly?crop_id=${encodeURIComponent(cropId)}`, { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as QuarterlyMarket;
      if (data.items?.length) return data;
    }
  } catch { /* 일별 API로 대체 */ }
  return fetchMarketQuarterly(cropId);
}
export type MarketVolume = { status: "ok" | "empty" | "unavailable"; items: { year: number; month: number; quantity: number }[] };
export async function fetchMarketVolume(cropId: string): Promise<MarketVolume> {
  const res = await fetch(`${API_BASE}/api/v1/market/volume?crop_id=${encodeURIComponent(cropId)}`, { cache: "no-store" });
  if (!res.ok) throw new Error("거래량을 불러오지 못했습니다");
  return res.json();
}

export type Scenario = {
  dscr_median: number;
  dscr_p10: number;
  annual_short_prob: number;
  crisis_prob: number;
  grace_payment: number;
  amort_payment: number;
  amort_payment_last: number;
  dscr_first_amort: number;
  cliff_multiple: number;
  first_risk_year: number | null;
  short_prob_by_year: number[];
};

export type AsOf = {
  income_survey_year?: number;
  cost_survey_year?: number;
  sigma_series?: string;
  guideline?: string;
  guideline_year?: number;
  guideline_checked_on?: string;
  market_window?: [string, string];
};

export type Diagnosis = {
  diagnosis_id: string;
  document_ref: string;
  status: "ok" | "no_capacity";
  input: {
    crop_id: string;
    crop_name: string;
    pyeong: number;
    living_cost: number;
    other_debt_service: number;
    requested_principal: number | null;
    product_id: string;
  };
  product: {
    id: string;
    name: string;
    limit: number;
    rate: number;
    grace_years: number;
    amort_years: number;
    amort_method: string;
    source: string;
  };
  income: {
    annual: number;
    /** 이 소득이 어디서 왔나. ACTUAL=실적 평균, CROP_AVERAGE=작목 통계 추정.
     *  화면은 반드시 이걸 밝힌다 — 밝히지 않으면 추정치를 실적처럼 읽는다. */
    source: "ACTUAL" | "CROP_AVERAGE";
    /** 실적이 있으면 그 평균, 없으면 null */
    actual_mean: number | null;
    /** 작목 통계로 추정한 값. 견주는 기준으로 항상 온다 */
    crop_average: number;
    history_years: number;
    source_note: string;
    capacity: number;
    /** 평년 소득이 흔들리는 범위 [하위10%, 상위10%]. 엔진이 낸다 — 화면에서 σ 를 환산하지 말 것. */
    band_p10_p90: [number, number];
  };
  /** 각 값이 언제 것인지. 엔진이 내려준다 — 화면에서 오늘 날짜로 채우지 말 것. */
  as_of?: AsOf;
  limits: {
    available: number;
    recommended: number;
    gap: number;
    /** 제도 한도 − 위험기반 한도. 화면에서 빼지 말 것. */
    unsafe_gap: number;
    risk_based: number;
    max_crisis_prob: number;
    max_crisis_prob_basis: string;
    max_crisis_prob_is_default: boolean;
    binding_constraint: "loan" | "livelihood";
    livelihood_floor_prob: number;
  };
  uncertainty?: {
    sigma_grid: {
      sigma: number;
      crisis_prob: number;
      annual_short_prob: number;
      dscr_median: number;
      risk_limit: number;
    }[];
    crisis_prob_low: number;
    crisis_prob_high: number;
    risk_limit_low: number;
    risk_limit_high: number;
    break_even_sigma: number | null;
  };
  scenarios: Record<string, Scenario>;
  schedules?: Record<string, number[]>;
  schedule: number[];
  min_area_pyeong: number;
  target_dscr: number;
  sigma: number;
  sigma_source: "MEASURED" | "PARTIAL" | "ASSUMED" | "PERSONAL" | "OVERRIDE";
  sigma_ci_scope: "market_common_only" | "own_history" | null;
  sigma_assumed_share: number | null;
  sigma_idiosyncratic: number;
  sigma_ci: [number, number] | null;
  sigma_method: string | null;
  sigma_reference: string | null;
  sigma_personalized: boolean;
  sigma_note: string | null;
  sigma_common: number | null;
  factors: {
    driver: "price" | "quantity" | "cost";
    share_price: number;
    share_quantity: number;
    share_cost: number;
    residual: number;
    elasticity: number;
    correlation: number;
    sigma_price: number;
    sigma_quantity: number;
    n: number;
    years: [number, number];
  } | null;
  market: {
    source: string;
    /** 시계열 구간 [시작, 끝]. 화면은 이 값만 쓴다 — 오늘 날짜를 찍지 않는다. */
    window?: [string, string];
    trading_days: number;
    annual_price_sigma: number | null;
    kosis_price_sigma: number | null;
    price_movement_ratio?: number;
    quote_is_carried?: boolean;
    garch: {
      alpha: number;
      beta: number;
      persistence: number;
      half_life_days: number;
      // 이월 시세가 많으면 판정하지 않는다 (null). '평상' 이라고 말하지 않는다.
      regime: "calm" | "normal" | "turbulent" | null;
      current_over_longrun: number;
    };
    note: string;
  } | null;
  assumptions: {
    p_disaster: number;
    n_sim: number;
    seed: number;
    installment_defer_max_count: number;
  };
  disclaimer: string;
};

export type Slots = {
  crop_id: string | null;
  pyeong: number | null;
  succession: boolean | null;
  years_farming: number | null;
  living_cost: number | null;
  other_debt_service: number | null;
  requested_principal: number | null;
  income_history?: number[];
};

export type ExtractResult = {
  slots: Slots;
  confidence: Record<string, number>;
  missing_required: string[];
  followup_question: string | null;
  defaults_applied: string[];
  extractor: "llm" | "rule";
};

export type Action = {
  text: string;
  detail: string;
  /** 서버는 무엇을 가리키는지만 말한다. 실제 경로는 화면이 정한다. */
  link: "farm" | "revenue" | "safety" | "finance" | "relief" | "policy" | null;
};

/** link → 실제 라우트. 서버에 경로를 박아두면 프런트 라우팅이 바뀔 때 서버도 고쳐야 한다. */
export const ACTION_HREF: Record<NonNullable<Action["link"]>, { href: string; label: string }> = {
  farm:    { href: "/app/farm",    label: "내 농가 정보" },
  revenue: { href: "/app/revenue", label: "수익 전망" },
  safety:  { href: "/app/safety",  label: "금융 안전진단" },
  finance: { href: "/app/finance", label: "맞춤 금융지원" },
  relief:  { href: "/app/relief",  label: "구제제도" },
  policy:  { href: "/policy",      label: "제도 근거" },
};

export type Explanation = {
  headline: string;
  body: string;
  actions: Action[];
  numbers_used: number[];
  dropped_sentences: string[];
  narrator: "llm" | "template";
};

export type Citation = {
  doc: string;
  section: string;
  text: string;
  url: string | null;
  doc_year: number | null;
  region: string | null;
};

export type RegulationAnswer = {
  answer: string;
  citations: Citation[];
  confidence: "high" | "medium" | "low" | "none";
  /** 발췌문과 어긋나 제거된 문장. 화면이 반드시 밝힌다 — 조용히 지우지 않는다. */
  dropped: string[];
};

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} 요청 실패 (${res.status})`);
  return res.json();
}

export const extractSlots = (text: string, known: Partial<Slots> = {}) =>
  post<ExtractResult>("/api/v1/extract", { text, known });

export const runDiagnose = (payload: {
  crop_id: string;
  pyeong: number;
  living_cost: number;
  other_debt_service?: number;
  requested_principal?: number | null;
  product_id?: string;
  income_history?: number[];
  /** 그 실적을 낸 면적(평). pyeong 과 다른 면적을 물을 때 반드시 보낸다. */
  income_history_pyeong?: number | null;
  max_crisis_prob?: number | null;
}) => post<Diagnosis>("/api/v1/diagnose", payload);

export const explain = (diagnosis: Diagnosis) =>
  post<Explanation>("/api/v1/explain", { diagnosis });

export const askRegulation = (question: string, context: Record<string, unknown> = {}) =>
  post<RegulationAnswer>("/api/v1/regulation/ask", { question, context });

export async function fetchDiagnosis(id: string): Promise<Diagnosis> {
  const res = await fetch(`${API_BASE}/api/v1/diagnose/${id}`);
  if (!res.ok) throw new Error(`진단 결과를 불러오지 못했습니다 (${res.status})`);
  return res.json();
}

export type CropRow = {
  id: string;
  name: string;
  price_category_code?: string;
  price_item_code?: string;
  large_code?: string;
  large_name?: string;
  middle_code?: string;
  middle_name?: string;
  income_per_10a: number;
  sigma: number;
  sigma_source: string;
  sigma_common: number | null;
  sigma_ci: [number, number] | null;
  sigma_n: number | null;
  group: string | null;
  driver: "price" | "quantity" | "cost" | null;
  harvest_months: number[];
  has_market: boolean;
  /** 이 작목 소득값의 조사연도. 작목마다 다르다. */
  income_year: number | null;
};

export type CropDetail = CropRow & {
  aliases: string[];
  gross_per_10a: number | null;
  cost_per_10a: number | null;
  cashflow_year: number | null;
  leverage: number | null;
  sigma_method: string | null;
  sigma_reference: string | null;
  factors: Diagnosis["factors"];
  market: Diagnosis["market"];
  kosis: Record<string, unknown> | null;
  unit_area_pyeong: number;
  idiosyncratic: { idiosyncratic_sigma: number; source: string; note: string };
};

export type ProductRow = {
  id: string;
  name: string;
  limit: number;
  rate: number;
  grace_years: number;
  amort_years: number;
  amort_method: string;
  source: string;
  note?: string;
};

export async function fetchCrops(): Promise<{
  source: string;
  unit_area_pyeong: number;
  crops: CropRow[];
}> {
  const res = await fetch(`${API_BASE}/api/v1/crops`);
  if (!res.ok) throw new Error("작목 목록을 불러오지 못했습니다");
  return res.json();
}
export type MarketCategory = { large_code: string; large_name: string; middle_code: string; middle_name: string };
export const DEFAULT_MARKET_CATEGORIES: MarketCategory[] = [
  { large_code: "08", large_name: "과일과채류", middle_code: "04", middle_name: "딸기" },
  { large_code: "08", large_name: "과일과채류", middle_code: "01", middle_name: "수박" },
  { large_code: "08", large_name: "과일과채류", middle_code: "06", middle_name: "방울토마토" },
  { large_code: "06", large_name: "엽경채류", middle_code: "01", middle_name: "배추" },
  { large_code: "07", large_name: "근채류", middle_code: "01", middle_name: "무" },
];
export async function fetchMarketCategories(): Promise<{ status: string; items: MarketCategory[] }> {
  const res = await fetch(`${API_BASE}/api/v1/market/categories`, { cache: "no-store" });
  if (!res.ok) throw new Error("품목코드를 불러오지 못했습니다");
  return res.json();
}

export async function fetchCrop(id: string): Promise<CropDetail> {
  const res = await fetch(`${API_BASE}/api/v1/crops/${id}`);
  if (!res.ok) throw new Error(`작목 정보를 불러오지 못했습니다 (${res.status})`);
  return res.json();
}

export async function fetchProducts(): Promise<{
  products: ProductRow[];
  disaster_relief: { damage_min: number; damage_max: number; defer_years: number }[];
  installment_defer_max_count: number;
  relief_source: string;
}> {
  const res = await fetch(`${API_BASE}/api/v1/products`);
  if (!res.ok) throw new Error("상품 목록을 불러오지 못했습니다");
  return res.json();
}


// ── 자료실 · 데이터 현황 ─────────────────────────────
export type CorpusDoc = {
  title: string; year: number | null; url: string | null;
  chunks: number; chars: number; sections: number;
};

export async function fetchCorpus(): Promise<{
  documents: CorpusDoc[]; total_chunks: number; note: string;
  /** 원문을 마지막으로 대조한 날. */
  checked_on: string | null;
}> {
  const res = await fetch(`${API_BASE}/api/v1/corpus`);
  if (!res.ok) throw new Error("자료실 목록을 불러오지 못했습니다");
  return res.json();
}

export type DataStats = {
  crops: {
    total: number; sigma_measured: number; sigma_min: number; sigma_max: number;
    with_market: number; with_kamis_mapping: number; with_harvest_months: number;
    cashflow_years: number[]; source: string;
  };
  corpus: { chunks: number };
  products: ProductRow[];
  simulation: Record<string, number>;
  sigma_decomposition: { idiosyncratic_sigma: number; source: string; note: string };
  verified_against_guideline: {
    document: string; checked_on: string;
    confirmed: { item: string; page: number; quote: string; model: string }[];
    not_modelled: { item: string; page: number; quote: string; why: string }[];
  };
};

export async function fetchStats(): Promise<DataStats> {
  const res = await fetch(`${API_BASE}/api/v1/stats`);
  if (!res.ok) throw new Error("데이터 현황을 불러오지 못했습니다");
  return res.json();
}

// ── 월별 현금흐름 ────────────────────────────────────
export type MonthFlow = {
  month: number; revenue: number; operating: number;
  living: number; debt: number; net: number; balance: number;
};

export type Cashflow = {
  crop: { id: string; name: string; cashflow_year: number | null; rescaled: boolean };
  year: number;
  is_grace_year: boolean;
  annual: {
    gross: number; operating_cost: number; income: number;
    living_cost: number; debt_payment: number; other_debt_service: number;
  };
  harvest_known: boolean;
  harvest_months: number[];
  trough_month: number;
  trough_balance: number;
  working_capital_need: number;
  annual_net: number;
  months: MonthFlow[];
  note: string;
};

export const fetchCashflow = (p: {
  crop_id: string; pyeong: number; living_cost: number;
  other_debt_service?: number; principal?: number; product_id?: string; year?: number;
  /** 실적. 안 보내면 현금흐름만 작목 통계 추정치로 그려져 자금지도와 갈린다. */
  actual_income?: number[];
  income_history?: number[];
}) => post<Cashflow>("/api/v1/cashflow", p);

// ── 스트레스 테스트 ──────────────────────────────────
export type StressScenario = {
  key: string; label: string; detail: string;
  income: number; income_change: number; capacity: number;
  dscr_median: number; crisis_prob: number; annual_short_prob: number;
  distress_prob: number; deferral_prob: number; relies_on_relief: boolean;
  first_risk_year: number | null; survives: boolean;
};

export type StressReport = {
  principal: number; tolerance: number; sigma: number; leverage: number;
  scenarios: StressScenario[]; note: string;
};

export const fetchStress = (p: {
  crop_id: string; pyeong: number; living_cost: number;
  other_debt_service?: number; principal?: number | null;
  product_id?: string; max_crisis_prob?: number | null;
}) => post<StressReport>("/api/v1/stress", p);

// ── 정책자금 자격 요건 ──────────────────────────────────────
/**
 * 요건 하나와 그 **근거 조항 원문**.
 * `check` 가 self 면 화면이 판정하지 않고 농가가 직접 대본다.
 */
export type Requirement = {
  key: string;
  label: string;
  check: "age_range" | "career_max" | "self";
  min: number | null;
  max: number | null;
  document: string;
  section: string;
  /** 시행지침 원문 그대로. 요약이 아니다. */
  quote: string;
  quote_truncated: boolean;
  source_url: string | null;
};

export type ProductEligibility = {
  product_id: string;
  product_name: string;
  document: string | null;
  requirements: Requirement[];
};

export async function fetchEligibility(): Promise<{
  products: ProductEligibility[];
  note: string;
}> {
  const res = await fetch(`${API_BASE}/api/v1/eligibility`);
  if (!res.ok) throw new Error("자격 요건을 불러오지 못했습니다");
  return res.json();
}


/** 원하는 금액을 감당하려면 무엇이 얼마나 달라져야 하는가.
 *  탐색은 엔진 이분탐색이라 같은 입력에 같은 답이 나온다 — LLM 이 만든 숫자가 아니다. */
export type Lever = {
  variable: string;
  label: string;
  unit: string;
  from_value: number;
  to_value: number | null;
  delta_ratio: number | null;
  crisis_prob_before: number;
  crisis_prob_after: number | null;
  reachable: boolean;
  /** 실제로 탐색한 범위. 커트라인을 숨기지 않기 위해 화면에 밝힌다. */
  searched_from: number;
  searched_to: number;
  note: string;
};

export type LeversResult = {
  target_principal: number;
  base_crisis_prob: number | null;
  max_crisis_prob: number;
  risk_based_limit: number;
  levers: Lever[];
  note: string;
};

export async function solveFor(body: {
  crop_id: string;
  pyeong: number;
  living_cost: number;
  other_debt_service?: number;
  target_principal: number;
  movables?: string[];
  actual_income?: number[];
}): Promise<LeversResult> {
  const res = await fetch(`${API_BASE}/api/v1/levers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || "계산하지 못했습니다");
  }
  return res.json();
}


/** 에이전트 상담. Planner 가 도구를 골라 실행하고, 그 흔적까지 돌려준다.
 *  화면은 분기를 판단하지 않는다 — 어떤 도구를 쓸지는 서버가 정한다. */
export type TraceEntry = {
  tool: string;
  args: Record<string, unknown>;
  ms: number;
  ok: boolean;
  error: string | null;
};

export type ConsultAnswer = {
  kind: "answer" | "ask";
  text: string;
  /** kind==="ask" 일 때만 */
  missing: string[];
  question: string;
  citations: Citation[];
  /** 설명 문장에서 검증을 통과한 수치들 */
  numbers_used: number[];
  /** 엔진 값과 안 맞아 제거된 문장. 숨기지 않고 개수를 보여준다. */
  dropped: string[];
  trace: TraceEntry[];
  warnings: string[];
  budget: { llm_calls: number; tool_calls: number };
  /** "llm" | "fallback" — 키가 없거나 계획이 실패하면 규칙기반으로 내려간다 */
  method: string;
  /** 도구 이름 → 결과. 숫자 카드는 설명 문장이 아니라 여기서 읽는다. */
  results: Record<string, any>;
};

export async function consult(body: {
  question: string;
  slots?: Record<string, unknown>;
}): Promise<ConsultAnswer> {
  const res = await fetch(`${API_BASE}/api/v1/consult`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slots: {}, ...body }),
  });
  if (!res.ok) throw new Error((await res.text()) || "상담에 실패했습니다");
  return res.json();
}


/** 전국 작목 평균 대비. 실적이 없으면 comparable=false 로 온다 — 화면이 입력을 유도한다. */
export type CropTraits = {
  cost_ratio: number | null;
  sigma: number;
  sigma_rank: number;
  sigma_total: number;
  driver: string | null;
  driver_label: string | null;
  income_year: number | null;
};

export type Benchmark = {
  crop_id: string;
  crop_name: string;
  crop_traits: CropTraits;
  comparable: boolean;
  reason?: string;
  message?: string;
  years_required?: number;
  my_income?: number;
  average_income?: number;
  ratio?: number;
  years?: number;
  source: string;
  note: string;
};

export type Draft = {
  body: string;
  dropped: string[];
  numbers_used: number[];
  method: string;
  citations: Citation[];
  disclaimer: string;
};

export type Prescription = {
  diagnosis: Diagnosis;
  benchmark: Benchmark;
  levers: { target_principal: number; levers: Lever[] } | null;
  draft: Draft;
};

/** 평균 비교만 따로 — 건강검진 화면이 처방 전체를 부르지 않아도 되게. */
export async function fetchBenchmark(body: {
  crop_id: string;
  pyeong: number;
  actual_income?: number[];
}): Promise<Benchmark> {
  const res = await fetch(`${API_BASE}/api/v1/benchmark`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.text()) || "평균 비교를 만들지 못했습니다");
  return res.json();
}

export async function prescribe(body: {
  crop_id: string;
  pyeong: number;
  living_cost: number;
  other_debt_service?: number;
  target_principal?: number;
  actual_income?: number[];
}): Promise<Prescription> {
  const res = await fetch(`${API_BASE}/api/v1/prescribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.text()) || "처방을 만들지 못했습니다");
  return res.json();
}


/** 25년 자금지도 — 언제 부담이 커지는가. 화면은 그리기만 한다. */
export type YearPoint = {
  year: number;
  due: number;
  is_grace: boolean;
  capacity: number;
  coverage: number;
  shortfall_prob: number;
};

export type FundingMapResult = {
  principal: number;
  crop_name: string;
  grace_years: number;
  term_years: number;
  years: YearPoint[];
  milestones: { year: number | null; kind: string; label: string }[];
  note: string;
};

export async function fetchFundingMap(body: {
  crop_id: string;
  pyeong: number;
  living_cost: number;
  other_debt_service?: number;
  principal?: number;
  actual_income?: number[];
  product_id?: string;
}): Promise<FundingMapResult> {
  const res = await fetch(`${API_BASE}/api/v1/funding-map`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.text()) || "자금지도를 만들지 못했습니다");
  return res.json();
}

/** 작목 전환 후보. **전환 비용 미반영** — 화면이 반드시 밝힌다. */
export type SwitchCandidate = {
  crop_id: string;
  crop_name: string;
  income: number;
  income_ratio: number;
  sigma: number;
  sigma_delta: number;
  cost_ratio: number | null;
  harvest_months: number[];
  overlap_ratio: number;
  blended_sigma: number | null;
  has_market_data: boolean;
};

export type SwitchResult = {
  current: { crop_id: string; crop_name: string; income: number; sigma: number; harvest_months: number[] };
  replace: SwitchCandidate[];
  diversify: SwitchCandidate[];
  cost_not_modelled: boolean;
  note: string;
};

export async function fetchSwitch(body: {
  crop_id: string;
  pyeong: number;
  top_n?: number;
}): Promise<SwitchResult> {
  const res = await fetch(`${API_BASE}/api/v1/switch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.text()) || "전환 후보를 만들지 못했습니다");
  return res.json();
}
