// supabase/functions/_shared/anthropic.ts
// Wrapper minimal Anthropic Messages API. Évite d'importer le SDK
// officiel (résolution esm.sh moins propre et plus de surface). On parle
// directement à https://api.anthropic.com/v1/messages.

import { requireEnv } from './env.ts';

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AnthropicSystemBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

export interface AnthropicCreateParams {
  model: string;
  max_tokens: number;
  temperature?: number;
  system: AnthropicSystemBlock[];
  messages: AnthropicMessage[];
}

export interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  stop_reason: string;
}

export async function callAnthropic(params: AnthropicCreateParams): Promise<AnthropicResponse> {
  const apiKey = requireEnv('ANTHROPIC_API_KEY');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31',
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`anthropic_http_${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as AnthropicResponse;
}

export function extractTextFromResponse(resp: AnthropicResponse): string {
  return resp.content.find((b) => b.type === 'text')?.text ?? '';
}
