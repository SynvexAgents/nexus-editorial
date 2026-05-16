// agent-6-angles-generator
// Endpoint POST. Génère 8 angles éditoriaux distincts (un par archétype)
// via Claude Opus 4.7. Validation Zod stricte (.length(8) + archétypes
// uniques). Post-processing déterministe (angle_id, ancrage_assurance
// regex, mention Synvex detect). UPSERT weekly_reports.angles_json.
//
// Body : { week_id: string, force?: boolean }
//
// Spécificités Opus 4.7 : pas de prefill, pas de temperature.

import { errorResponse, handleCorsPreflight, jsonResponse } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { getSupabase } from '../_shared/supabase.ts';
import { logger } from '../_shared/logger.ts';
import { currentIsoWeek, extractWeekNumber } from '../_shared/week.ts';
import { loadContextBrief, loadVoiceTone } from '../_shared/system_prompts.ts';
import { callAnthropic, extractTextFromResponse } from '../_shared/anthropic.ts';
import { computeAnthropicCost, OPUS_4_7 } from '../_shared/pricing.ts';
import { extractJsonObject } from '../_shared/json_extract.ts';
import {
  type Archetype,
  type Angle,
  type InsuranceTrends,
  type LinkedinTrends,
  type WeeklyAngles,
  weeklyAnglesSchema,
} from '../_shared/schemas.ts';

const REQUIRED_ARCHETYPES: Archetype[] = [
  'constat_lucide',
  'retour_experience_metier',
  'contrarian_assurance',
  'pedagogie_technique',
  'observation_signal_faible',
  'analyse_donnee',
  'anecdote_terrain',
  'these_marche',
];

const ANCRAGE_REGEX =
  /\b(S\/P|loss ratio|ratio combiné|ratio combine|IBNR|prime|primes|sinistre|sinistres|ACPR|RGPD|bordereau|bordereaux|MGA|courtage|mutuelle|mutuelles|claims|indemnisation|fronteur|fronting|assureur|assureurs|insurtech|réassureur|reassureur|réassurance|reassurance|conventions|rétrocession|retrocession|rétrocessions|retrocessions|audit trail|EIOPA|Solvency|solvabilité|solvabilite|CatNat|catnat|IARD|santé collective|sante collective|prévoyance|prevoyance)\b/i;
const SYNVEX_PRODUCT_REGEX = /\b(Orion|Helios|Chiron|Hermès|Hermes|Argus|Atlas|Cortex)\b/i;
const SYNVEX_NAME_REGEX = /\bSynvex\b/i;
const PLACEHOLDER_RISK = 'aucun risque majeur identifié (post-processor placeholder)';

async function buildSystemPrompt(): Promise<string> {
  const [brief, tone] = await Promise.all([loadContextBrief(), loadVoiceTone()]);
  return `=== RÔLE ===

Tu es l'Angle Generator du système Nexus Editorial de Synvex. Tu produis EXACTEMENT 8 angles éditoriaux pour la semaine, un par archétype distinct, chacun ancré dans le marché de l'assurance française et calibré pour LinkedIn FR.

=== CONTEXTE SYNVEX (INVARIANT) ===

${brief}

=== TON CIBLE (INVARIANT) ===

${tone}

=== MISSION ===

Inputs : week_id, linkedin_trends, insurance_trends, voice_pack_excerpts (0-5).

Produis un JSON conforme à WeeklyAngles : OBJET racine { "angles": [...] } avec EXACTEMENT 8 entrées, un par archétype DISTINCT parmi :
${REQUIRED_ARCHETYPES.join(', ')}.

CRITIQUE :
- 8 angles, pas 7 ni 9.
- 8 archétypes DISTINCTS.
- Si pas de matière sur un archétype, génère-le quand même.
- Aucun texte hors JSON.

=== CHAMPS PAR ANGLE (12) ===

1. angle_id : W{numéro}-A{1..8} (placeholders OK, post-processing régénère).
2. archetype : enum strict ci-dessus.
3. titre_interne : 40-80 chars.
4. hook_brut : 1-3 phrases sec, calibré Synvex.
5. these_centrale : 2-4 phrases, position défendable.
6. promesse_lecteur : 1-2 phrases opérationnelles.
7. structure_proposee : structure narrative courte.
8. longueur_cible : court (<500c), moyen (500-1200c), long (>1200c). VARIE.
9. tonalite : registre précis.
10. ancrage_assurance : DOIT contenir terme métier précis (S/P, IBNR, ACPR, bordereau, MGA, courtage, sinistre, prime, claims, conventions, etc.).
11. ancrage_linkedin : référence mécanique linkedin_trends.
12. icp_vise : enum {courtier, MGA, mutuelle, insurtech, dirigeant_general}. VARIE (≥ 4 distincts sur 8).
13. risques : 1-3 strings spécifiques (sinon ["aucun risque majeur identifié"]).

=== RÈGLES PAR ARCHÉTYPE ===

- constat_lucide : observation factuelle, sans prescription.
- retour_experience_metier : récit court généralisé (pas dossier précis).
- contrarian_assurance : thèse défendue, contrepied argumenté.
- pedagogie_technique : concept actuariel/opérationnel précis, non condescendant.
- observation_signal_faible : signal peu commenté, s'appuie sur insurance_trends.signaux_faibles si possible.
- analyse_donnee : UN chiffre avec contexte (échantillon/durée/source).
- anecdote_terrain : scène quotidien opé sans inventer.
- these_marche : position structurelle 1-3 ans.

=== CONTRAINTES NON NÉGOCIABLES ===

A. Aucune mention Synvex / Orion / Helios / Chiron / Hermès / Argus / Atlas / Cortex.
B. Aucun lexique banni (cf. voice tone).
C. Aucun hook banni.
D. Aucun chiffre orphelin.
E. Vouvoiement.
F. Aucune flatterie ni prescription gratuite.
G. Diversité forcée : 8 archétypes distincts, ≥ 4 ICP distincts, ≥ 2 longueurs distinctes.

=== FORMAT SORTIE ===

JSON strict : { "angles": [ { 12 champs } × 8 ] }. Aucun texte hors JSON. Pas de markdown.`;
}

function buildUserPrompt(input: {
  week_id: string;
  linkedin_trends: LinkedinTrends;
  insurance_trends: InsuranceTrends;
  voice_pack_excerpts: unknown[];
}): string {
  const vp =
    input.voice_pack_excerpts.length === 0
      ? '(voice pack vide — applique strictement le VOICE_TONE du system prompt)'
      : JSON.stringify(input.voice_pack_excerpts, null, 2);
  return `Voici les données de la semaine ${input.week_id}.

Génère EXACTEMENT 8 angles éditoriaux, un par archétype DISTINCT.

Réponds par UN SEUL objet JSON avec clé racine "angles", commençant par { et finissant par }.

=== INPUT 1 : week_id ===
${input.week_id}

=== INPUT 2 : linkedin_trends ===
${JSON.stringify(input.linkedin_trends, null, 2)}

=== INPUT 3 : insurance_trends ===
${JSON.stringify(input.insurance_trends, null, 2)}

=== INPUT 4 : voice_pack_excerpts ===
${vp}

RAPPEL : 8 archétypes distincts (${REQUIRED_ARCHETYPES.join(', ')}), ≥ 4 ICP distincts, ≥ 2 longueurs distinctes, aucune mention Synvex/produits.`;
}

function validateArchetypeCoverage(angles: WeeklyAngles): string | null {
  const seen = new Map<Archetype, number>();
  for (const a of angles) seen.set(a.archetype, (seen.get(a.archetype) ?? 0) + 1);
  const missing = REQUIRED_ARCHETYPES.filter((a) => !seen.has(a));
  const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([a, n]) => `${a}×${n}`);
  if (!missing.length && !duplicates.length) return null;
  const parts: string[] = [];
  if (missing.length) parts.push(`manquants: ${missing.join(', ')}`);
  if (duplicates.length) parts.push(`dupliqués: ${duplicates.join(', ')}`);
  return parts.join(' | ');
}

function postProcessAngles(angles: WeeklyAngles, weekId: string) {
  const weekNum = extractWeekNumber(weekId);
  let ancrageFlagged = 0;
  let emptyRisks = 0;
  let synvexFlags: string[] = [];
  const processed: Angle[] = angles.map((a, i) => {
    let m = { ...a, angle_id: `W${weekNum}-A${i + 1}` };
    if (!ANCRAGE_REGEX.test(m.ancrage_assurance)) ancrageFlagged += 1;
    if (m.risques.length === 0) {
      m = { ...m, risques: [PLACEHOLDER_RISK] };
      emptyRisks += 1;
    }
    const allText = [
      m.titre_interne,
      m.hook_brut,
      m.these_centrale,
      m.promesse_lecteur,
      m.structure_proposee,
      m.tonalite,
      m.ancrage_assurance,
      m.ancrage_linkedin,
      ...m.risques,
    ].join('\n');
    if (SYNVEX_PRODUCT_REGEX.test(allText))
      synvexFlags.push(`pos ${i + 1}: produit ${SYNVEX_PRODUCT_REGEX.exec(allText)?.[0]}`);
    if (SYNVEX_NAME_REGEX.test(allText)) synvexFlags.push(`pos ${i + 1}: brand Synvex`);
    return m;
  });
  const icpDistinct = new Set(processed.map((a) => a.icp_vise)).size;
  const longueurDistinct = new Set(processed.map((a) => a.longueur_cible)).size;
  return {
    angles: processed as WeeklyAngles,
    report: {
      ancrage_ok: processed.length - ancrageFlagged,
      ancrage_flagged: ancrageFlagged,
      icp_distinct: icpDistinct,
      longueur_distinct: longueurDistinct,
      empty_risks_filled: emptyRisks,
      synvex_flags: synvexFlags,
      has_critical: synvexFlags.length > 0,
    },
  };
}

Deno.serve(async (req: Request) => {
  const cors = handleCorsPreflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);
  const authErr = verifyAuth(req);
  if (authErr) return authErr;

  const log = logger.child({ fn: 'agent-6-angles-generator' });
  const t0 = Date.now();

  try {
    const body = (await req.json().catch(() => ({}))) as { week_id?: string; force?: boolean };
    const weekId = body.week_id ?? currentIsoWeek();
    const sb = getSupabase();

    if (!body.force) {
      const { data: existing } = await sb
        .from('weekly_reports')
        .select('angles_json')
        .eq('week_id', weekId)
        .maybeSingle();
      if (existing && (existing as { angles_json: unknown }).angles_json) {
        return jsonResponse({ skipped: true, reason: 'already_has_angles', week_id: weekId });
      }
    }

    // Charge linkedin_trends + insurance_trends (avec fallback insurance W-1 si vide).
    const { data: rowDirect } = await sb
      .from('weekly_reports')
      .select('linkedin_trends_json, insurance_trends_json')
      .eq('week_id', weekId)
      .maybeSingle();
    const direct = rowDirect as {
      linkedin_trends_json: LinkedinTrends | null;
      insurance_trends_json: InsuranceTrends | null;
    } | null;
    if (!direct?.linkedin_trends_json)
      return errorResponse('linkedin_trends_json_missing', 400, { week_id: weekId });

    let insurance = direct.insurance_trends_json;
    let insuranceSource = weekId;
    const totalI = insurance
      ? (insurance.regulation_acpr?.length ?? 0) +
        (insurance.sinistres_fraude?.length ?? 0) +
        (insurance.courtage_distribution?.length ?? 0) +
        (insurance.mutuelles_complementaires?.length ?? 0) +
        (insurance.insurtech_ia_assurance?.length ?? 0) +
        (insurance.back_office_productivite?.length ?? 0) +
        (insurance.signaux_faibles?.length ?? 0) +
        (insurance.actualites_majeures?.length ?? 0)
      : 0;
    if (totalI === 0) {
      const { data: recent } = await sb
        .from('weekly_reports')
        .select('week_id, insurance_trends_json')
        .not('insurance_trends_json', 'is', null)
        .lt('week_id', weekId)
        .order('week_id', { ascending: false })
        .limit(4);
      for (const r of (recent ?? []) as Array<{
        week_id: string;
        insurance_trends_json: InsuranceTrends | null;
      }>) {
        const t = r.insurance_trends_json;
        if (!t) continue;
        const tot =
          (t.regulation_acpr?.length ?? 0) +
          (t.sinistres_fraude?.length ?? 0) +
          (t.courtage_distribution?.length ?? 0) +
          (t.mutuelles_complementaires?.length ?? 0) +
          (t.insurtech_ia_assurance?.length ?? 0) +
          (t.back_office_productivite?.length ?? 0) +
          (t.signaux_faibles?.length ?? 0) +
          (t.actualites_majeures?.length ?? 0);
        if (tot > 0) {
          insurance = t;
          insuranceSource = r.week_id;
          break;
        }
      }
    }
    if (!insurance) return errorResponse('no_usable_insurance_trends', 400);

    // Voice pack : fallback graceful — sans embeddings ici, on prend [].
    // (Le module voice-pack-matcher OpenAI peut être ajouté plus tard si
    //  besoin ; pour l'instant comportement vide cohérent avec runs précédents
    //  où la table synvex_voice_pack est vide.)
    const voice_pack_excerpts: unknown[] = [];

    const systemPrompt = await buildSystemPrompt();
    const userPrompt = buildUserPrompt({
      week_id: weekId,
      linkedin_trends: direct.linkedin_trends_json,
      insurance_trends: insurance,
      voice_pack_excerpts,
    });
    const messages = [{ role: 'user' as const, content: userPrompt }];
    const systemBlocks = [
      { type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } },
    ];

    let lastError: string | null = null;
    let final: { angles: WeeklyAngles; usage: Record<string, number>; retried: boolean } | null =
      null;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const resp = await callAnthropic({
        model: 'claude-opus-4-7',
        max_tokens: 8192,
        system: systemBlocks,
        messages,
      });
      const text = extractTextFromResponse(resp);
      let parsed: unknown;
      try {
        parsed = extractJsonObject(text);
      } catch (e) {
        lastError = `parse_failed_${attempt}: ${(e as Error).message}`;
        if (attempt < 2) {
          messages.push({ role: 'assistant', content: text });
          messages.push({
            role: 'user',
            content: 'Renvoie UN JSON unique { "angles": [...] } avec 8 entrées.',
          });
        }
        continue;
      }
      const anglesRaw =
        typeof parsed === 'object' && parsed && 'angles' in parsed
          ? (parsed as { angles: unknown }).angles
          : parsed;
      const zod = weeklyAnglesSchema.safeParse(anglesRaw);
      if (!zod.success) {
        const issue = zod.error.issues[0];
        lastError = `zod_failed_${attempt}: ${issue ? `${issue.path.join('.')}: ${issue.message}` : 'unknown'}`;
        if (attempt < 2) {
          messages.push({ role: 'assistant', content: text });
          messages.push({
            role: 'user',
            content: `Zod failed: ${lastError}. .length(8) strict, archétypes ${REQUIRED_ARCHETYPES.join(', ')}. Renvoie corrigé.`,
          });
        }
        continue;
      }
      const coverage = validateArchetypeCoverage(zod.data as WeeklyAngles);
      if (coverage) {
        lastError = `archetype_coverage_${attempt}: ${coverage}`;
        if (attempt < 2) {
          messages.push({ role: 'assistant', content: text });
          messages.push({
            role: 'user',
            content: `Archétypes incorrects : ${coverage}. Régénère avec chaque archétype apparaissant EXACTEMENT 1 fois.`,
          });
        }
        continue;
      }
      final = {
        angles: zod.data as WeeklyAngles,
        usage: {
          input_tokens: resp.usage.input_tokens,
          output_tokens: resp.usage.output_tokens,
          cache_creation_input_tokens: resp.usage.cache_creation_input_tokens ?? 0,
          cache_read_input_tokens: resp.usage.cache_read_input_tokens ?? 0,
        },
        retried: attempt > 1,
      };
      break;
    }

    if (!final) return errorResponse(`agent_6_failed_after_2_attempts: ${lastError}`, 500);

    const pp = postProcessAngles(final.angles, weekId);
    const cost = computeAnthropicCost(
      {
        input_tokens: final.usage.input_tokens,
        output_tokens: final.usage.output_tokens,
        cache_creation_input_tokens: final.usage.cache_creation_input_tokens,
        cache_read_input_tokens: final.usage.cache_read_input_tokens,
      },
      OPUS_4_7,
    );

    const { error: upErr } = await sb.from('weekly_reports').upsert(
      {
        week_id: weekId,
        angles_json: pp.angles as unknown,
        produced_at: new Date().toISOString(),
      },
      { onConflict: 'week_id' },
    );
    if (upErr) return errorResponse(`upsert_failed: ${upErr.message}`, 500);

    const duration = Date.now() - t0;
    log.info(
      {
        week_id: weekId,
        duration_ms: duration,
        cost_eur: cost.cost_eur,
        retried: final.retried,
        ...pp.report,
      },
      'agent_6_done',
    );

    return jsonResponse({
      week_id: weekId,
      insurance_source_week: insuranceSource,
      retried: final.retried,
      duration_ms: duration,
      cost_usd: cost.cost_usd,
      cost_eur: cost.cost_eur,
      validation_report: pp.report,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'agent_6_failed');
    return errorResponse(msg, 500);
  }
});
