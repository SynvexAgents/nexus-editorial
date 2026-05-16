// supabase/functions/_shared/pricing.ts
// Tarification centralisée USD / 1M tokens. Source : platform.claude.com,
// perplexity.ai/pricing, openai.com/pricing — mai 2026.

export const USD_TO_EUR = 0.92;

export const HAIKU_4_5 = {
  input_usd_per_m: 1.0,
  output_usd_per_m: 5.0,
  cache_write_usd_per_m: 1.25,
  cache_read_usd_per_m: 0.1,
};

export const OPUS_4_7 = {
  input_usd_per_m: 5.0,
  output_usd_per_m: 25.0,
  cache_write_usd_per_m: 6.25,
  cache_read_usd_per_m: 0.5,
};

export const PERPLEXITY_SONAR_PRO = {
  input_usd_per_m: 3.0,
  output_usd_per_m: 15.0,
};

export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export function computeAnthropicCost(
  usage: AnthropicUsage,
  pricing: typeof HAIKU_4_5,
): { cost_usd: number; cost_eur: number } {
  const cacheCreation = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cost_usd =
    (usage.input_tokens / 1_000_000) * pricing.input_usd_per_m +
    (usage.output_tokens / 1_000_000) * pricing.output_usd_per_m +
    (cacheCreation / 1_000_000) * pricing.cache_write_usd_per_m +
    (cacheRead / 1_000_000) * pricing.cache_read_usd_per_m;
  return { cost_usd, cost_eur: cost_usd * USD_TO_EUR };
}

export function computePerplexityCost(
  input_tokens: number,
  output_tokens: number,
): {
  cost_usd: number;
  cost_eur: number;
} {
  const cost_usd =
    (input_tokens / 1_000_000) * PERPLEXITY_SONAR_PRO.input_usd_per_m +
    (output_tokens / 1_000_000) * PERPLEXITY_SONAR_PRO.output_usd_per_m;
  return { cost_usd, cost_eur: cost_usd * USD_TO_EUR };
}
