export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") ?? "http://localhost:8000";

export type Scenario = {
  dscr_median: number;
  dscr_p10: number;
  annual_short_prob: number;
  crisis_prob: number;
  grace_payment: number;
  amort_payment: number;
  cliff_multiple: number;
  first_risk_year: number | null;
  short_prob_by_year: number[];
};

export type Diagnosis = {
  diagnosis_id: string;
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
    source: string;
  };
  income: { annual: number; capacity: number };
  limits: {
    available: number;
    recommended: number;
    gap: number;
    risk_based: number;
    max_crisis_prob: number;
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
  sigma_source: "ASSUMED" | "MEASURED";
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
    trading_days: number;
    annual_price_sigma: number | null;
    kosis_price_sigma: number | null;
    garch: {
      alpha: number;
      beta: number;
      persistence: number;
      half_life_days: number;
      regime: "calm" | "normal" | "turbulent";
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

export type Explanation = {
  headline: string;
  body: string;
  actions: string[];
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

export async function fetchCrops(): Promise<{
  crops: { id: string; name: string; income_per_10a: number; sigma_source: string }[];
}> {
  const res = await fetch(`${API_BASE}/api/v1/crops`);
  if (!res.ok) throw new Error("작목 목록을 불러오지 못했습니다");
  return res.json();
}
