// agent-6-angles-generator
// Endpoint POST. Génère 8 angles éditoriaux distincts (un par archétype)
// via Claude Opus 4.7. Validation Zod stricte (.length(8) + archétypes
// uniques). Post-processing déterministe (angle_id, ancrage_assurance
// regex, mention Synvex detect). UPSERT weekly_reports.angles_json.
//
// Body : { week_id: string, force?: boolean }
//
// Spécificités Opus 4.7 : pas de prefill, pas de temperature.

import { callAnthropic, extractTextFromResponse } from '../_shared/anthropic.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { errorResponse, handleCorsPreflight, jsonResponse } from '../_shared/cors.ts';
import { extractJsonObject } from '../_shared/json_extract.ts';
import { logger } from '../_shared/logger.ts';
import { OPUS_4_7, computeAnthropicCost } from '../_shared/pricing.ts';
import {
  ARCHETYPE_POOL_KEYS,
  buildArchetypePoolBlock,
  buildAttackAxisBlock,
  buildEditorialHistoryBlock,
} from '../_shared/editorial-memory.ts';
import type { WeekHistoryRow } from '../_shared/editorial-memory.ts';
import {
  type Angle,
  type InsuranceTrends,
  type LinkedinTrends,
  type WeeklyAngles,
  weeklyAnglesSchema,
} from '../_shared/schemas.ts';
import { getSupabase } from '../_shared/supabase.ts';
import { loadContextBrief, loadVoiceTone } from '../_shared/system_prompts.ts';
import { currentIsoWeek, extractWeekNumber } from '../_shared/week.ts';

// Pool actif des 10 archétypes (diversity engine v2.3). Set de clés pour la
// validation de couverture déterministe.
const ARCHETYPE_POOL_SET = new Set<string>(ARCHETYPE_POOL_KEYS);

const ANCRAGE_REGEX =
  /\b(S\/P|loss ratio|ratio combiné|ratio combine|IBNR|prime|primes|sinistre|sinistres|ACPR|RGPD|bordereau|bordereaux|MGA|courtage|mutuelle|mutuelles|claims|indemnisation|fronteur|fronting|assureur|assureurs|insurtech|réassureur|reassureur|réassurance|reassurance|conventions|rétrocession|retrocession|rétrocessions|retrocessions|audit trail|EIOPA|Solvency|solvabilité|solvabilite|CatNat|catnat|IARD|santé collective|sante collective|prévoyance|prevoyance)\b/i;
const SYNVEX_PRODUCT_REGEX = /\b(Orion|Helios|Chiron|Hermès|Hermes|Argus|Atlas|Cortex)\b/i;
const SYNVEX_NAME_REGEX = /\bSynvex\b/i;
const PLACEHOLDER_RISK = 'aucun risque majeur identifié (post-processor placeholder)';

async function buildSystemPrompt(historyBlock: string, weekNumber: number): Promise<string> {
  const [brief, tone] = await Promise.all([loadContextBrief(), loadVoiceTone()]);
  const memoryBlock = historyBlock.length > 0 ? `\n${historyBlock}\n` : '';
  const axisBlock = buildAttackAxisBlock(weekNumber);
  const poolBlock = buildArchetypePoolBlock();
  return `=== RÔLE ===

Tu es l'Angle Generator du système Nexus Editorial de Synvex. Tu produis EXACTEMENT 8 angles éditoriaux pour la semaine, chacun ancré dans le marché de l'assurance française et calibré pour LinkedIn FR.

=== CONTEXTE SYNVEX (INVARIANT) ===

${brief}

=== TON CIBLE (INVARIANT) ===

${tone}
${memoryBlock}
${axisBlock}

=== MISSION ===

Inputs : week_id, linkedin_trends, insurance_trends, voice_pack_excerpts (0-5).

Produis un JSON conforme à WeeklyAngles : OBJET racine { "angles": [...] } avec EXACTEMENT 8 entrées, utilisant 8 archétypes DISTINCTS tirés du POOL DE 10 ci-dessous.

CRITIQUE :
- 8 angles, pas 7 ni 9.
- 8 archétypes DISTINCTS, TOUS tirés du pool de 10 (jamais d'archétype hors pool).
- Si pas de matière sur un archétype choisi, génère-le quand même.
- Aucun texte hors JSON.

${poolBlock}

=== CHAMPS PAR ANGLE (13 — v2 mai 2026) ===

1. angle_id : W{numéro}-A{1..8} (placeholders OK, post-processing régénère).
2. archetype : clé snake_case tirée du POOL DE 10 (cf. section POOL D'ARCHÉTYPES).
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
14. produit_synvex_ancrage : enum strict parmi {Orion, Vega, Chiron, Argus, Helios, Hermès, Nexus, Atlas, Cortex}. Le produit Synvex que cet angle pré-positionne implicitement (Agent 7 héritera pour bridge subtil/moyen). Choisir selon les fiches §9 du context_brief (par ICP, mécanisme, problème). Respecter accents (Hermès).

=== MÉCANIQUES LEAD-GENERATING (OBLIGATOIRES SUR AU MOINS 2/3 ANGLES) ===

Un angle Synvex performant intègre AU MOINS UN de ces 4 leviers :

LEVIER 1 — Take controversée mesurée
Affirmer une thèse forte sur l'évolution du métier dans les 12-24 mois. Pas une provocation gratuite, une lecture lucide qui dérange un consensus mou.
Exemple : "L'audit trail manuel est mort. Les cabinets qui ne s'industrialisent pas dans 18 mois perdront leur agrément délégation, pas leurs clients."

LEVIER 2 — Asymétrie d'information
Révéler un savoir terrain que la majorité du marché ne voit pas encore. Lister 3 éléments, donner les 2 premiers, garder le 3e en teasing.
Exemple : "3 questions que les contrôleurs ACPR posent maintenant qu'ils ne posaient pas en 2023. 1. [...] 2. [...] La 3e est celle qui pose le plus de cabinets en difficulté."

LEVIER 3 — Mini-cas chiffré (anonymisé)
Décrire un cas client réel anonymisé avec chiffres avant/après. Format : situation initiale → action → résultat chiffré.
Exemple : "Cabinet X. 1200 dossiers/an. Audit ACPR raté en mars. Voici les 3 changements opérés en 8 semaines : [...] Résultat : audit suivant passé avec 0 réserve."
Règle anonymisation : "un cabinet", "un courtier régional", "un MGA spécialisé en dommage", JAMAIS de nom propre.

LEVIER 4 — Lead magnet implicite
Documenter une checklist / framework / liste de critères qui a manifestement été construite avec sérieux. Inviter au DM pour recevoir le détail. Posture "j'ai fait le travail, dispo si tu en as besoin", pas "achetez mon produit".
Exemple : "On a documenté les 7 critères qu'un audit trail défendable coche en 2026. Liste en DM si utile."

=== POSTURE D'ÉCRITURE — FOUNDER QUI SAIT ===

Pas observateur. Pas consultant. Pas essayiste.
Founder Synvex qui a vu 12 cabinets ce trimestre et qui te dit ce qu'il a observé. Données terrain spécifiques. Revendication d'expertise mesurée. Promesse implicite qu'il y a une solution pour qui veut creuser.

Mauvais (à éviter) : "La plupart des cabinets que je vois aujourd'hui ont des procédures écrites."
Bon : "On a regardé les audit trails de 12 cabinets ce trimestre. 9 sur 12 ne tiennent pas un tirage au sort de 3 dossiers."

=== CONTRAINTES NON NÉGOCIABLES ===

A. Aucune mention Synvex / Orion / Vega / Chiron / Argus / Helios / Hermès / Nexus / Atlas / Cortex dans le contenu produit (hook_brut, these_centrale, etc.). Le champ produit_synvex_ancrage est l'EXCEPTION : il porte le nom du produit en métadonnée orchestration.
B. Aucun lexique banni (cf. voice tone).
C. Aucun hook banni.
D. Aucun chiffre orphelin.
E. Vouvoiement.
F. Aucune flatterie ni prescription gratuite.
G. Diversité forcée : 8 archétypes DISTINCTS tirés du pool de 10 (priorise ceux non utilisés dans les 3 dernières semaines — cf. HISTORIQUE ÉDITORIAL), ≥ 4 ICP distincts, ≥ 2 longueurs distinctes, AU MOINS 5 produits Synvex distincts sur les 8 angles (idéal : 8 produits différents).
H. Stratégie éditoriale v2 : ton angle doit permettre à Agent 7 de placer un bridge produit SUBTIL (80%) ou MOYEN (20%) en fin de post, une mention IA (subtile/directe/démonstrative anonymisée), et un CTA implicite via question terrain ouverte.
I. Mention clients en générique anonymisé : jamais d'entité nommée (jamais Phenomen, Henner, MSH). Formulations : "un de mes clients", "un opérateur récent", "sur un déploiement courtage", "dans une mutuelle régionale".

=== FORMAT SORTIE ===

JSON strict : { "angles": [ { 14 champs } × 8 ] } avec le champ produit_synvex_ancrage en plus des 13 historiques. Aucun texte hors JSON. Pas de markdown.`;
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

Génère EXACTEMENT 8 angles éditoriaux, 8 archétypes DISTINCTS tirés du pool de 10 (cf. system prompt).

Réponds par UN SEUL objet JSON avec clé racine "angles", commençant par { et finissant par }.

=== INPUT 1 : week_id ===
${input.week_id}

=== INPUT 2 : linkedin_trends ===
${JSON.stringify(input.linkedin_trends, null, 2)}

=== INPUT 3 : insurance_trends ===
${JSON.stringify(input.insurance_trends, null, 2)}

=== INPUT 4 : voice_pack_excerpts ===
${vp}

RAPPEL : 8 archétypes DISTINCTS du pool de 10, en priorisant ceux absents des 3 dernières semaines et en respectant l'axe d'attaque de la semaine, ≥ 4 ICP distincts, ≥ 2 longueurs distinctes, AU MOINS 5 produits Synvex distincts (parmi Orion/Vega/Chiron/Argus/Helios/Hermès/Nexus/Atlas/Cortex), aucune mention Synvex dans le contenu du post (le nom produit reste en métadonnée \`produit_synvex_ancrage\` uniquement).`;
}

// Diversity engine v2.3 : on n'exige plus un set FIXE de 8 archétypes, mais
// 8 archétypes DISTINCTS tous tirés du POOL DE 10 actif. Rejette : doublons,
// et tout archétype hors pool (ex : ancien archétype encore accepté par le
// schéma pour rétro-compat, mais interdit en génération).
function validateArchetypeCoverage(angles: WeeklyAngles): string | null {
  const seen = new Map<string, number>();
  for (const a of angles) seen.set(a.archetype, (seen.get(a.archetype) ?? 0) + 1);
  const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([a, n]) => `${a}×${n}`);
  const outOfPool = [...seen.keys()].filter((a) => !ARCHETYPE_POOL_SET.has(a));
  if (!duplicates.length && !outOfPool.length) return null;
  const parts: string[] = [];
  if (duplicates.length) parts.push(`dupliqués: ${duplicates.join(', ')}`);
  if (outOfPool.length) parts.push(`hors pool de 10: ${outOfPool.join(', ')}`);
  return parts.join(' | ');
}

function postProcessAngles(angles: WeeklyAngles, weekId: string) {
  const weekNum = extractWeekNumber(weekId);
  let ancrageFlagged = 0;
  let emptyRisks = 0;
  const synvexFlags: string[] = [];
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

    // Mémoire éditoriale (diversity engine v2.3) : 8 dernières semaines
    // (hors semaine courante) avec angles_json OU winners_json. Best-effort —
    // si la query échoue, on continue sans mémoire (jamais bloquant).
    let historyBlock = '';
    try {
      const { data: hist, error: histErr } = await sb
        .from('weekly_reports')
        .select('week_id, angles_json, winners_json')
        .lt('week_id', weekId)
        .or('angles_json.not.is.null,winners_json.not.is.null')
        .order('week_id', { ascending: false })
        .limit(8);
      if (histErr) throw new Error(histErr.message);
      historyBlock = buildEditorialHistoryBlock((hist ?? []) as WeekHistoryRow[]);
      log.info(
        { weeks_loaded: (hist ?? []).length, history_injected: historyBlock.length > 0 },
        'editorial_memory_loaded',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg }, 'editorial_memory_failed_proceeding_without');
    }

    const weekNumber = extractWeekNumber(weekId);
    const systemPrompt = await buildSystemPrompt(historyBlock, weekNumber);
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
            content: `Zod failed: ${lastError}. .length(8) strict, archétypes ∈ pool de 10 (${ARCHETYPE_POOL_KEYS.join(', ')}). Renvoie corrigé.`,
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
            content: `Archétypes incorrects : ${coverage}. Régénère 8 angles avec 8 archétypes DISTINCTS, tous tirés du pool de 10 (${ARCHETYPE_POOL_KEYS.join(', ')}).`,
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
