// supabase/functions/_shared/system_prompts.ts
// Charge les Markdown invariants (context_brief, voice_tone) depuis la
// table system_prompts. Cache mémoire par instance d'Edge Function pour
// éviter un round-trip DB à chaque invocation.

import { getSupabase } from './supabase.ts';

const cache = new Map<string, { content: string; loadedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function loadSystemPrompt(promptId: string): Promise<string> {
  const cached = cache.get(promptId);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.content;
  }
  const sb = getSupabase();
  const { data, error } = await sb
    .from('system_prompts')
    .select('content')
    .eq('prompt_id', promptId)
    .maybeSingle();
  if (error) throw new Error(`system_prompt_select_failed: ${error.message}`);
  if (!data || typeof (data as { content?: unknown }).content !== 'string') {
    throw new Error(`system_prompt_missing: ${promptId} (seed via pnpm seed:system-prompts)`);
  }
  const content = (data as { content: string }).content;
  cache.set(promptId, { content, loadedAt: Date.now() });
  return content;
}

export async function loadContextBrief(): Promise<string> {
  return loadSystemPrompt('synvex_context_brief');
}

export async function loadVoiceTone(): Promise<string> {
  return loadSystemPrompt('synvex_voice_tone');
}
