// agent-7-editorial-director
// Endpoint POST. Sélectionne 3 winners complémentaires parmi les 8 angles
// + rédige les posts finaux via Claude Opus 4.7. Post-processor déterministe :
// override anti_cliche / absence_survente / vocabulaire_metier si claims
// mensongers, recalcule longueur_finale, vérifie complémentarité ≥ 2 arch
// ET ≥ 2 ICP. UPSERT weekly_reports.winners_json.
//
// Body : { week_id: string, force?: boolean }

import { errorResponse, handleCorsPreflight, jsonResponse } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { getSupabase } from '../_shared/supabase.ts';
import { logger } from '../_shared/logger.ts';
import { currentIsoWeek } from '../_shared/week.ts';
import { loadContextBrief, loadVoiceTone } from '../_shared/system_prompts.ts';
import { callAnthropic, extractTextFromResponse } from '../_shared/anthropic.ts';
import { computeAnthropicCost, OPUS_4_7 } from '../_shared/pricing.ts';
import { extractJsonObject } from '../_shared/json_extract.ts';
import {
  type InsuranceTrends,
  type LinkedinTrends,
  type WeeklyAngles,
  type WeeklyWinner,
  type WeeklyWinners,
  weeklyWinnersSchema,
} from '../_shared/schemas.ts';

const BANNED_LEXIQUE = [
  'synergie',
  'synergique',
  'disruption',
  'disruptif',
  'révolution',
  'révolutionner',
  'révolutionnaire',
  'transformation digitale',
  'paradigme',
  'holistique',
  '360°',
  'game-changer',
  'next-gen',
  'leverage',
  'expérience client',
  'user-centric',
  'data-driven',
  'best in class',
  'world-class',
  "à l'ère de l'IA",
  "l'avenir de l'assurance",
  'le futur du courtage',
  '100% conforme',
  "0% d'erreur",
  'garantie ACPR',
  'magique',
  'incroyable',
];
const BANNED_LEXIQUE_REGEX = new RegExp(
  `\\b(${BANNED_LEXIQUE.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'i',
);
const ECOSYSTEME_REGEX = /\bécosystème\b(?!\s+assurance\b)/i;
const BOOST_REGEX = /\bboost(?:e|es|ez|er|ée|ées|és)?\b/i;
const SYNVEX_PRODUCT_REGEX = /\b(Orion|Helios|Chiron|Hermès|Hermes|Argus|Atlas|Cortex)\b/i;
const SYNVEX_NAME_REGEX = /\bSynvex\b/gi;
const METIER_REGEX =
  /\b(S\/P|IBNR|ACPR|RGPD|bordereau|bordereaux|MGA|mutuelle|mutuelles|courtage|claims|sinistre|sinistres|prime|primes|matrice|fronteur|fronting|réassureur|reassureur|réassurance|reassurance|assureur|assureurs|insurtech|loss ratio|ratio combiné|ratio combine|indemnisation|EIOPA|Solvency|solvabilité|CatNat|catnat|IARD|rétrocession|retrocession|conventions sinistres|audit trail|matrice de délégation)\b/gi;
const BANNED_HOOKS: RegExp[] = [
  /^et si je vous disais/i,
  /^hier soir/i,
  /^beaucoup pensent que/i,
  /^on me demande souvent/i,
  /^voici \d+\s+choses/i,
  /^\d+\s+ans plus tard/i,
  /^devinez quoi/i,
  /^j'ai une question pour vous/i,
  /^personne n'en parle/i,
];

async function buildSystemPrompt(): Promise<string> {
  const [brief, tone] = await Promise.all([loadContextBrief(), loadVoiceTone()]);
  return `=== RÔLE ===

Tu es l'Editorial Director du système Nexus Editorial de Synvex. Tu reçois 8 angles éditoriaux et tu produis les 3 posts LinkedIn FR de la semaine pour Marouane Borsali, fondateur de Synvex.

Mode : senior editor, lucide, autoritaire sans flatterie.

=== CONTEXTE SYNVEX (INVARIANT) ===

${brief}

=== TON CIBLE (INVARIANT) ===

${tone}

=== MISSION — 6 ÉTAPES ===

ÉTAPE 1 — SCORING DES 8 ANGLES

Pour chacun des 8 angles, 5 sous-scores entiers /10 :
- engagement_potentiel
- credibilite
- autorite_synvex
- transferabilite
- risque (INVERSE : 10 = aucun risque)

score_total = eng×0.25 + cred×0.25 + autorite×0.20 + transf×0.15 + risque×0.15.

ÉTAPE 2 — FUSIONS POSSIBLES (0-2)

Fusion intéressante si 2 angles : partage sujet/ICP, combinaison > somme, post < 1500c.

ÉTAPE 3 — SÉLECTION 3 WINNERS (complémentarité)

≥ 2 archétypes distincts. ≥ 2 ICP distincts. ≥ 2 longueurs distinctes. Rationale stratégique 4-6 lignes.

ÉTAPE 4 — RÉDACTION POSTS FINAUX

A. Vouvoiement. Voix Synvex (sec, lucide, phrases courtes).
B. Aucune mention Synvex / Orion / Helios / Chiron / Hermès / Argus / Atlas / Cortex.
C. Aucun lexique banni (synergie, disruption, révolution, transformation digitale, etc.).
D. Aucune phrase bannie (l'IA va révolutionner, à l'ère de l'IA, 100% conforme, etc.).
E. Aucun hook banni (Et si je vous disais, Hier soir, etc.).
F. Pas de chiffre orphelin.
G. Longueur respectée (court < 500c, moyen 500-1200c, long > 1200c mais < 2200c).
H. Hook accrocheur. Constat/chiffre/contre-intuition.
I. CTA = question ouverte ou rien.
J. Premier paragraphe : constat ou observation.

ÉTAPE 5 — 3 HOOK_VARIANTES par winner (tuple 3 strings).

ÉTAPE 6 — AUTO-CHECK QUALITÉ (6 booleans honnêtes) :
- anti_cliche_ok
- ancrage_actu_assurance_ok
- ton_synvex_ok
- longueur_alignee_tendance_ok
- absence_survente_ok
- vocabulaire_metier_ok (≥ 2 termes métier dans le post)

⚠️ Post-processor vérifie les claims. Mens et tu seras corrigé.

=== FORMAT SORTIE ===

JSON strict { "winners": [3 entrées], "all_scoring": [8 entrées]?, "fusions_proposees": [...]? }.
Chaque winner :
{ post_position (1|2|3), winner_id, fusion_used (false ou [id1, id2]), scoring (array), rationale_strategique, post_final, hook_variantes (3 strings), cta_recommande, longueur_finale (int>0), checklist_qualite_passee (6 booleans) }.
Ordre post_position 1, 2, 3. Aucun texte hors JSON.`;
}

function buildUserPrompt(input: {
  week_id: string;
  angles: WeeklyAngles;
  linkedin_trends: LinkedinTrends;
  insurance_trends: InsuranceTrends;
}): string {
  return `Voici les données de la semaine ${input.week_id}.

8 angles → 3 winners complémentaires + rédaction posts finaux + 3 hooks variantes + auto-check honnête.

Réponds par UN SEUL objet JSON commençant par { et finissant par }.

=== INPUT 1 : week_id ===
${input.week_id}

=== INPUT 2 : 8 angles ===
${JSON.stringify(input.angles, null, 2)}

=== INPUT 3 : linkedin_trends ===
${JSON.stringify(input.linkedin_trends, null, 2)}

=== INPUT 4 : insurance_trends ===
${JSON.stringify(input.insurance_trends, null, 2)}

RAPPEL : 3 winners EXACTEMENT, complémentaires. Aucune mention Synvex/produits. Auto-check honnête.`;
}

function containsBannedLex(text: string): boolean {
  if (BANNED_LEXIQUE_REGEX.test(text)) return true;
  if (ECOSYSTEME_REGEX.test(text)) return true;
  if (BOOST_REGEX.test(text)) return true;
  return false;
}

function containsBannedHook(post: string): boolean {
  const first = post.trim().slice(0, 200);
  return BANNED_HOOKS.some((re) => re.test(first));
}

function countSynvex(t: string): number {
  return (t.match(SYNVEX_NAME_REGEX) ?? []).length;
}

function countMetier(t: string): number {
  const m = t.match(METIER_REGEX);
  if (!m) return 0;
  return new Set(m.map((x) => x.toLowerCase())).size;
}

function postProcessWinners(
  winners: WeeklyWinners,
  angles: WeeklyAngles,
): {
  winners: WeeklyWinners;
  report: Record<string, unknown>;
} {
  const angleById = new Map(angles.map((a) => [a.angle_id, a]));
  const overrides: Array<Record<string, unknown>> = [];
  const criticalFlags: string[] = [];

  const processed: WeeklyWinner[] = winners.map((w) => {
    let m = { ...w, checklist_qualite_passee: { ...w.checklist_qualite_passee } };
    const post = m.post_final;
    const allText = `${post}\n${m.hook_variantes.join('\n')}`;

    if (
      m.checklist_qualite_passee.anti_cliche_ok &&
      (containsBannedLex(allText) || containsBannedHook(post))
    ) {
      overrides.push({
        post_position: m.post_position,
        field: 'anti_cliche_ok',
        from: true,
        to: false,
      });
      m.checklist_qualite_passee.anti_cliche_ok = false;
    }
    const synvexCount = countSynvex(allText);
    const hasProduct = SYNVEX_PRODUCT_REGEX.test(allText);
    if (m.checklist_qualite_passee.absence_survente_ok && (hasProduct || synvexCount > 1)) {
      overrides.push({
        post_position: m.post_position,
        field: 'absence_survente_ok',
        from: true,
        to: false,
      });
      m.checklist_qualite_passee.absence_survente_ok = false;
    }
    if (synvexCount > 1) criticalFlags.push(`pos ${m.post_position}: Synvex × ${synvexCount}`);
    if (hasProduct)
      criticalFlags.push(
        `pos ${m.post_position}: produit ${SYNVEX_PRODUCT_REGEX.exec(allText)?.[0]}`,
      );

    if (m.checklist_qualite_passee.vocabulaire_metier_ok && countMetier(post) < 2) {
      overrides.push({
        post_position: m.post_position,
        field: 'vocabulaire_metier_ok',
        from: true,
        to: false,
      });
      m.checklist_qualite_passee.vocabulaire_metier_ok = false;
    }

    if (m.longueur_finale !== post.length) {
      overrides.push({
        post_position: m.post_position,
        field: 'longueur_finale',
        from: m.longueur_finale,
        to: post.length,
      });
      m = { ...m, longueur_finale: post.length };
    }
    return m;
  });

  // Complémentarité (via angle d'origine).
  const archs: string[] = [];
  const icps: string[] = [];
  const longs: string[] = [];
  for (const w of processed) {
    const id = w.fusion_used === false ? w.winner_id : (w.fusion_used as [string, string])[0];
    const a = angleById.get(id);
    if (a) {
      archs.push(a.archetype);
      icps.push(a.icp_vise);
      longs.push(a.longueur_cible);
    }
    // Vérifie cohérence fusion.
    if (w.fusion_used !== false) {
      const [id1, id2] = w.fusion_used as [string, string];
      if (!angleById.has(id1) || !angleById.has(id2)) {
        criticalFlags.push(`pos ${w.post_position}: fusion référence angle inconnu`);
      }
    }
  }
  const archD = new Set(archs).size;
  const icpD = new Set(icps).size;
  const longD = new Set(longs).size;
  if (archD < 2 || icpD < 2) {
    criticalFlags.push(`complémentarité insuffisante : ${archD} arch / ${icpD} ICP (min 2 chacun)`);
  }

  return {
    winners: processed as WeeklyWinners,
    report: {
      archetypes_distinct: archD,
      icp_distinct: icpD,
      longueurs_distinct: longD,
      complementarite_ok: archD >= 2 && icpD >= 2,
      overrides,
      critical_flags: criticalFlags,
    },
  };
}

Deno.serve(async (req: Request) => {
  const cors = handleCorsPreflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);
  const authErr = verifyAuth(req);
  if (authErr) return authErr;

  const log = logger.child({ fn: 'agent-7-editorial-director' });
  const t0 = Date.now();

  try {
    const body = (await req.json().catch(() => ({}))) as { week_id?: string; force?: boolean };
    const weekId = body.week_id ?? currentIsoWeek();
    const sb = getSupabase();

    if (!body.force) {
      const { data: existing } = await sb
        .from('weekly_reports')
        .select('winners_json')
        .eq('week_id', weekId)
        .maybeSingle();
      if (existing && (existing as { winners_json: unknown }).winners_json) {
        return jsonResponse({ skipped: true, reason: 'already_has_winners', week_id: weekId });
      }
    }

    const { data: row } = await sb
      .from('weekly_reports')
      .select('angles_json, linkedin_trends_json, insurance_trends_json')
      .eq('week_id', weekId)
      .maybeSingle();
    const r = row as {
      angles_json: WeeklyAngles | null;
      linkedin_trends_json: LinkedinTrends | null;
      insurance_trends_json: InsuranceTrends | null;
    } | null;
    if (!r?.angles_json) return errorResponse('angles_json_missing', 400, { week_id: weekId });
    if (!r.linkedin_trends_json) return errorResponse('linkedin_trends_json_missing', 400);
    if (!r.insurance_trends_json) return errorResponse('insurance_trends_json_missing', 400);

    // Fallback insurance W-1 si vide.
    let insurance = r.insurance_trends_json;
    const tot =
      (insurance.regulation_acpr?.length ?? 0) +
      (insurance.sinistres_fraude?.length ?? 0) +
      (insurance.courtage_distribution?.length ?? 0) +
      (insurance.mutuelles_complementaires?.length ?? 0) +
      (insurance.insurtech_ia_assurance?.length ?? 0) +
      (insurance.back_office_productivite?.length ?? 0) +
      (insurance.signaux_faibles?.length ?? 0) +
      (insurance.actualites_majeures?.length ?? 0);
    if (tot === 0) {
      const { data: recent } = await sb
        .from('weekly_reports')
        .select('week_id, insurance_trends_json')
        .not('insurance_trends_json', 'is', null)
        .lt('week_id', weekId)
        .order('week_id', { ascending: false })
        .limit(4);
      for (const ro of (recent ?? []) as Array<{ insurance_trends_json: InsuranceTrends | null }>) {
        const t = ro.insurance_trends_json;
        if (!t) continue;
        const t2 =
          (t.regulation_acpr?.length ?? 0) +
          (t.sinistres_fraude?.length ?? 0) +
          (t.courtage_distribution?.length ?? 0) +
          (t.mutuelles_complementaires?.length ?? 0) +
          (t.insurtech_ia_assurance?.length ?? 0) +
          (t.back_office_productivite?.length ?? 0) +
          (t.signaux_faibles?.length ?? 0) +
          (t.actualites_majeures?.length ?? 0);
        if (t2 > 0) {
          insurance = t;
          break;
        }
      }
    }

    const systemPrompt = await buildSystemPrompt();
    const userPrompt = buildUserPrompt({
      week_id: weekId,
      angles: r.angles_json,
      linkedin_trends: r.linkedin_trends_json,
      insurance_trends: insurance,
    });
    const messages = [{ role: 'user' as const, content: userPrompt }];
    const systemBlocks = [
      { type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } },
    ];

    let lastError: string | null = null;
    let final: { winners: WeeklyWinners; usage: Record<string, number>; retried: boolean } | null =
      null;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const resp = await callAnthropic({
        model: 'claude-opus-4-7',
        max_tokens: 12288,
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
            content: "Renvoie UN JSON unique avec clé 'winners' (3 entrées).",
          });
        }
        continue;
      }
      const winnersRaw =
        typeof parsed === 'object' && parsed && 'winners' in parsed
          ? (parsed as { winners: unknown }).winners
          : parsed;
      const zod = weeklyWinnersSchema.safeParse(winnersRaw);
      if (!zod.success) {
        const issue = zod.error.issues[0];
        lastError = `zod_failed_${attempt}: ${issue ? `${issue.path.join('.')}: ${issue.message}` : 'unknown'}`;
        if (attempt < 2) {
          messages.push({ role: 'assistant', content: text });
          messages.push({
            role: 'user',
            content: `Zod failed: ${lastError}. .length(3) strict, hook_variantes tuple 3 strings, checklist_qualite_passee 6 booleans. Corriger.`,
          });
        }
        continue;
      }
      final = {
        winners: zod.data as WeeklyWinners,
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

    if (!final) return errorResponse(`agent_7_failed_after_2_attempts: ${lastError}`, 500);

    const pp = postProcessWinners(final.winners, r.angles_json);
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
        winners_json: pp.winners as unknown,
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
      'agent_7_done',
    );

    return jsonResponse({
      week_id: weekId,
      retried: final.retried,
      duration_ms: duration,
      cost_usd: cost.cost_usd,
      cost_eur: cost.cost_eur,
      validation_report: pp.report,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'agent_7_failed');
    return errorResponse(msg, 500);
  }
});
