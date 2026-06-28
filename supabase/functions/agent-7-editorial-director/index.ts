// agent-7-editorial-director
// Endpoint POST. Sélectionne 3 winners complémentaires parmi les 8 angles
// + rédige les posts finaux via Claude Opus 4.7. Post-processor déterministe :
// override anti_cliche / absence_survente / vocabulaire_metier si claims
// mensongers, recalcule longueur_finale, vérifie complémentarité ≥ 2 arch
// ET ≥ 2 ICP. UPSERT weekly_reports.winners_json.
//
// Body : { week_id: string, force?: boolean }

import { callAnthropic, extractTextFromResponse } from '../_shared/anthropic.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { errorResponse, handleCorsPreflight, jsonResponse } from '../_shared/cors.ts';
import { extractJsonObject } from '../_shared/json_extract.ts';
import { logger } from '../_shared/logger.ts';
import { OPUS_4_7, computeAnthropicCost } from '../_shared/pricing.ts';
import {
  buildEditorialHistoryBlock,
  type WeekHistoryRow,
} from '../_shared/editorial-memory.ts';
import { computeEditorialWarnings, mergeEditorialWarnings } from '../_shared/editorial-scoring.ts';
import {
  type InsuranceTrends,
  type LinkedinTrends,
  type WeeklyAngles,
  type WeeklyWinner,
  type WeeklyWinners,
  weeklyWinnersSchema,
} from '../_shared/schemas.ts';
import { getSupabase } from '../_shared/supabase.ts';
import { loadContextBrief, loadVoiceTone } from '../_shared/system_prompts.ts';
import { currentIsoWeek } from '../_shared/week.ts';

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
const SYNVEX_PRODUCT_REGEX =
  /\b(Orion|Vega|Helios|Chiron|Hermès|Hermes|Argus|Nexus|Atlas|Cortex)\b/i;
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

async function buildSystemPrompt(historyBlock: string): Promise<string> {
  const [brief, tone] = await Promise.all([loadContextBrief(), loadVoiceTone()]);
  const memoryBlock = historyBlock.length > 0 ? `\n${historyBlock}\n` : '';
  return `=== RÔLE ===

Tu es l'Editorial Director du système Nexus Editorial de Synvex. Tu reçois 8 angles éditoriaux et tu produis les 3 posts LinkedIn FR de la semaine pour Marouane Borsali, fondateur de Synvex.

Mode : senior editor, lucide, autoritaire sans flatterie.

=== CONTEXTE SYNVEX (INVARIANT) ===

${brief}

=== TON CIBLE (INVARIANT) ===

${tone}
${memoryBlock}
=== MISSION — 6 ÉTAPES ===

ÉTAPE 1 — SCORING DES 8 ANGLES (v2.3 — 7 sous-scores)

Pour chacun des 8 angles, 7 sous-scores entiers /10 :
- engagement_potentiel
- credibilite
- autorite_synvex
- transferabilite
- risque (INVERSE : 10 = aucun risque)
- lead_trigger_presence (v2.1) : présence d'au moins 1 des 4 leviers lead-generating dans l'angle source — take controversée mesurée, asymétrie d'information, mini-cas chiffré anonymisé, lead magnet implicite. 0 = angle purement descriptif/analytique. 10 = lead trigger explicite et défendable.
- originalite_vs_historique (NEW — v2.3) : à quel point ce post se distingue des posts des 8 dernières semaines (cf. HISTORIQUE ÉDITORIAL) sur le hook, la mécanique d'accroche, l'angle et la structure. 8-10 = franchement nouveau, aucune redite. 5-7 = quelques similarités mais traitement distinct. 0-4 = redondant avec un post récent → forte pénalité. Si aucun historique fourni, score neutre 7.

score_total = eng×0.18 + cred×0.13 + autorite×0.13 + transf×0.08 + risque×0.13 + lead_trigger×0.20 + originalite×0.15.
(Pondération v2.3, somme = 1.00 : lead_trigger 20%, originalite 15% — la diversité éditoriale pèse désormais lourd dans la sélection.)

ALERTES (champ top-level "editorial_warning", string, optionnel) :
- "no_lead_trigger_in_winners" : si AUCUN des 3 winners n'a lead_trigger_presence ≥ 6.
- "low_originality_vs_recent_weeks" : si les 3 winners ont TOUS originalite_vs_historique < 5.
Si les deux s'appliquent, choisis le plus grave (low_originality). Sinon omets le champ. (Le système recalcule aussi ces alertes de façon déterministe en aval.)

ÉTAPE 2 — FUSIONS POSSIBLES (0-2)

Fusion intéressante si 2 angles : partage sujet/ICP, combinaison > somme, post < 1500c.

ÉTAPE 3 — SÉLECTION 3 WINNERS (complémentarité + rotation produits + originalité + piliers v2.4)

≥ 2 archétypes distincts. ≥ 2 ICP distincts. ≥ 2 longueurs distinctes. IDÉAL ≥ 3 produits Synvex différents (parmi Orion/Vega/Chiron/Argus/Helios/Hermès/Nexus/Atlas/Cortex — champ produit_synvex_ancrage de chaque angle source). PRIVILÉGIE les angles à forte originalite_vs_historique : à qualité égale, choisis le plus distinct des 8 dernières semaines. Rationale stratégique 4-6 lignes incluant rotation produit ET justification d'originalité.

ÉQUILIBRE DES 3 PILIERS (v2.4) : les 8 angles sont générés autour de 3 piliers éditoriaux — PREUVE (problème concret + résultat chiffré), ÉDUCATION (comment une mécanique métier fonctionne vraiment), PHILOSOPHIE (prise de position, conviction). Parmi les 8, privilégie une sélection finale de 3 qui couvre les 3 piliers quand c'est possible, pour un équilibre éditorial. Ce n'est PAS un rejet strict : la qualité et l'originalité priment, mais à qualité égale, préfère la diversité de piliers.

ROTATION ÉQUITABLE : si le user prompt fournit product_rotation_history (count produits adressés sur 4 dernières semaines), priorise les produits sous-représentés. Un produit déjà adressé 2x récemment doit être dé-priorisé.

ÉTAPE 4 — RÉDACTION POSTS FINAUX

A. Vouvoiement. Voix Synvex (sec, lucide, phrases courtes).
B. Aucune mention Synvex / Orion / Vega / Chiron / Argus / Helios / Hermès / Nexus / Atlas / Cortex dans le contenu (post_final, hook_variantes). Le nom produit vit en métadonnée produit_synvex_ancrage UNIQUEMENT.
C. Aucun lexique banni (synergie, disruption, révolution, transformation digitale, etc.).
D. Aucune phrase bannie (l'IA va révolutionner, à l'ère de l'IA, 100% conforme, etc.).
E. Aucun hook banni (Et si je vous disais, Hier soir, etc.).
F. Pas de chiffre orphelin.
G. Longueur respectée (court < 500c, moyen 500-1200c, long > 1200c mais < 2200c).
H. Hook accrocheur. Constat/chiffre/contre-intuition.
I. CTA = question terrain ouverte ("Comment vous gérez ça ?") ou rien. Jamais "DM moi" ni "réservez démo".
J. Premier paragraphe : constat ou observation.
K. **BRIDGE PRODUIT EN FIN DE POST (v2)** : selon produit_synvex_ancrage du winner, place un bridge SUBTIL (80% cas — observation qui fait écho) ou MOYEN (20% — catégorie de solution sans nommer Synvex). JAMAIS explicite (interdit).
L. **MENTION IA OPÉRATIONNELLE (v2)** : chaque post doit mentionner l'IA en mode A subtil ("acteurs avancés y répondent par X type d'automatisation"), B direct ("agent IA correctement calibré résout en quelques minutes"), ou C démonstratif anonymisé ("un opérateur récent : agent qui ingère X, sort Y"). Jamais "ça reste manuel partout".
M. **MENTION CLIENTS EN GÉNÉRIQUE ANONYMISÉ** : jamais Phenomen/Henner/MSH. Toujours "un de mes clients", "un opérateur récent", "sur un déploiement courtage".

=== GARDE-FOUS ÉDITORIAUX (v2.1 mai 2026) ===

GF1 — ZÉRO NOM PROPRE D'ENTITÉ (clients, prospects, concurrents)
Aucune mention nominale d'un cabinet, courtier, MGA, mutuelle, insurtech ou compagnie identifiable, même louangeuse. Toujours générique : "un cabinet courtage IARD", "un MGA spécialisé en dommage", "un opérateur récent en mutuelle régionale". Vise au-delà de la liste Phenomen/Henner/MSH : aucune marque tierce du marché français de l'assurance ne doit apparaître dans le contenu.

GF2 — ZÉRO CHIFFRE PROJECTIF NON SOURCÉ
Tout chiffre du post doit être OBSERVÉ (passé/présent), pas projeté. Interdits : "X cabinets vont perdre leur agrément d'ici 2027", "Y% du marché aura basculé en 2028", "vous économiserez 80% de temps". Autorisés : "9 sur 12 cabinets observés ce trimestre", "audit ACPR mars 2026 : 13 M€ de sanction", "délai moyen passé de 18 jours à 36 heures sur 6 derniers dossiers accompagnés". Si le chiffre est une projection, le marquer comme telle ("notre hypothèse pour 2027 : ...") et la défendre dans le post.

GF3 — UNE SEULE MENTION IA PAR POST (maximum)
Le mot "IA", "intelligence artificielle", "agent IA", "LLM", "modèle" ne doit apparaître QU'UNE SEULE FOIS dans tout le post_final. Une fois suffit pour le bridge. Plus de mentions = post qui sonne marketing-IA générique au lieu de retour d'expérience terrain. Si tu as besoin de re-référencer l'IA, utilise une formulation indirecte ("l'automatisation", "ce type d'outillage", "ce que ça change opérationnellement").

=== RÈGLE BRIDGE PRODUIT QUANTIFIÉ (v2.1) ===

Quand le post mentionne la mécanique IA Synvex (bridge subtil ou moyen), formuler en terme de résultat business observable, PAS en description technique du mécanisme.

INTERDICTION (description du mécanisme) :
- "agents qui argumentent une décision, se contestent, laissent une trace lisible"
- "l'agent ingère le PDF, extrait les clauses, structure la sortie"
- "système multi-agents qui analyse, débat et conclut"

OBLIGATION (résultat chiffré ou métrique opérationnelle) :
- "Sur les 6 derniers dossiers de contrôle accompagnés, le délai de production de l'audit trail est passé de 18 jours en moyenne à 36 heures."
- "Sur un déploiement courtage récent : 3 semaines à 4 jours pour répondre à un contrôle ACPR."
- "Un cabinet : audit raté en mars, audit suivant 8 semaines plus tard passé avec 0 réserve."

Format préféré du bridge quantifié :
[contexte client anonymisé] + [chiffre avant/après ou métrique opérationnelle] + [mention IA en cause subordonnée, pas en sujet principal].

Exemple complet correct :
"Sur les 6 derniers dossiers de contrôle accompagnés, le délai de production de l'audit trail est passé de 18 jours en moyenne à 36 heures. L'IA n'a pas remplacé le gestionnaire — elle a externalisé la traçabilité au moment de la gestion."

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

JSON strict { "winners": [3 entrées], "all_scoring": [8 entrées]?, "fusions_proposees": [...]?, "editorial_warning": "..."? }.
Chaque winner :
{ post_position (1|2|3), winner_id, fusion_used (false ou [id1, id2]), scoring (array), rationale_strategique, post_final, hook_variantes (3 strings), cta_recommande, longueur_finale (int>0), checklist_qualite_passee (6 booleans), produit_synvex_ancrage (enum 9 produits — hérité de l'angle source) }.

scoring : chaque entrée DOIT contenir { angle_id, score_total, sous_scores, commentaire }. Le champ sous_scores est OBLIGATOIRE — objet {engagement_potentiel, credibilite, autorite_synvex, transferabilite, risque, lead_trigger_presence, originalite_vs_historique} (7 entiers /10, v2.3). Ne JAMAIS omettre sous_scores, même si le score_total est bas.

editorial_warning (TOP-LEVEL, optionnel, string) : "low_originality_vs_recent_weeks" si les 3 winners ont tous originalite_vs_historique < 5 ; sinon "no_lead_trigger_in_winners" si aucun winner n'a lead_trigger_presence ≥ 6 ; sinon omettre.

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

    // Mémoire éditoriale (diversity engine v2.3) : 8 dernières semaines pour
    // que l'Editorial Director note l'originalité vs historique. Best-effort.
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

    const systemPrompt = await buildSystemPrompt(historyBlock);
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
    let final: {
      winners: WeeklyWinners;
      usage: Record<string, number>;
      retried: boolean;
      editorial_warning: string | null;
    } | null = null;

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
      const editorialWarning =
        typeof parsed === 'object' &&
        parsed &&
        'editorial_warning' in parsed &&
        typeof (parsed as { editorial_warning: unknown }).editorial_warning === 'string'
          ? ((parsed as { editorial_warning: string }).editorial_warning as string)
          : null;
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
        editorial_warning: editorialWarning,
      };
      break;
    }

    if (!final) return errorResponse(`agent_7_failed_after_2_attempts: ${lastError}`, 500);

    const pp = postProcessWinners(final.winners, r.angles_json);

    // editorial_warnings (v2.3) : recalcul DÉTERMINISTE depuis les sous-scores
    // des winners (no_lead_trigger_in_winners, low_originality_vs_recent_weeks),
    // fusionné avec l'éventuel warning émis par le modèle.
    const editorialWarnings = mergeEditorialWarnings(
      final.editorial_warning,
      computeEditorialWarnings(pp.winners),
    );
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
        editorial_warnings: editorialWarnings,
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
      editorial_warnings: editorialWarnings,
      // backward-compat : champ singulier conservé (premier warning ou null).
      editorial_warning: editorialWarnings[0] ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'agent_7_failed');
    return errorResponse(msg, 500);
  }
});
