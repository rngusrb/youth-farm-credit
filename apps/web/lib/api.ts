export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") ?? "http://localhost:8000";

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
