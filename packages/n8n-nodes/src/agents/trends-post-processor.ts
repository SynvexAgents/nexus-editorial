/**
 * trends-post-processor — passe déterministe appliquée à la sortie Claude
 * de l'Agent 4 LinkedinTrends Synthesizer.
 *
 * Pourquoi : Haiku 4.5 a montré des biais résistants au prompt-engineering
 * sur deux règles (tri strict par avg_engagement_norm, conditionnalité
 * stricte de la mention data quality). Le post-processing déterministe
 * sort ces responsabilités du LLM — plus rapide, plus prévisible, testable
 * unit.
 *
 * Le post-processor :
 *   A. Re-trie top_hooks, top_formats, top_topic_clusters strictement par
 *      avg_engagement_norm décroissant.
 *   B. Calcule les diversités hook_type / format / ton depuis les INPUTS
 *      (post_analyses), pas depuis la sortie Claude.
 *   C. Si toutes diversités ≥ 3 : strip toute mention "data quality" /
 *      "diversité éditoriale" / "valeurs distinctes" de synthese_textuelle.
 *   D. Si au moins une diversité < 3 : garde la mention si présente,
 *      sinon insère une phrase standardisée en début de synthese_textuelle.
 *
 * Idempotent : appeler 2x produit le même résultat.
 */
import type { LinkedinTrends } from '@nexus/shared';
import type { TrendsInput } from './linkedin-trends-synthesizer.js';

// Patterns détectant les mentions data quality / méta-mesure de diversité.
// Pas de flag /g : `test()` n'a pas besoin de l'état lastIndex et /g cause
// des bugs subtils en réutilisation. Sensible à la casse via /i.
const DATA_QUALITY_PATTERNS: RegExp[] = [
  /data[\s_-]*quality(?:[\s_-]*warning)?/i,
  /diversit[ée][\s_-]*[ée]ditoriale/i,
  /valeurs?[\s_-]*distinctes?/i,
];

const ALREADY_FLAGGED_PATTERNS: RegExp[] = [
  /diversit[ée][\s_-]*[ée]ditoriale[\s_-]*limit[ée]e/i,
  /data[\s_-]*quality[\s_-]*warning/i,
];

/**
 * Coupe en phrases sur ponctuation forte (. ! ?) suivie d'espace. Conserve
 * la ponctuation. Tolère les sauts de ligne. Si pas de séparateur trouvé,
 * retourne le texte entier en une seule entrée.
 */
function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  return trimmed.split(/(?<=[.!?])\s+/);
}

function sentenceMatchesDataQuality(sentence: string): boolean {
  return DATA_QUALITY_PATTERNS.some((re) => re.test(sentence));
}

function stripDataQualitySentences(text: string): string {
  const sentences = splitSentences(text);
  const kept = sentences.filter((s) => !sentenceMatchesDataQuality(s));
  const joined = kept.join(' ').trim();
  // Garde-fou : si le strip réduit la synthèse à une chaîne trop courte
  // (cas où Claude a essentiellement écrit que de la méta-mesure), on
  // garde l'original pour ne pas violer la contrainte Zod .min(1).
  if (joined.length < 20) return text.trim();
  return joined;
}

function buildDiversityNote(hook: number, format: number, ton: number): string {
  return `Diversité éditoriale limitée cette semaine (hook_type: ${hook}, format: ${format}, ton: ${ton} valeurs distinctes).`;
}

function hasDiversityMention(text: string): boolean {
  return ALREADY_FLAGGED_PATTERNS.some((re) => re.test(text));
}

export interface PostProcessStats {
  /** Diversités calculées depuis les inputs. */
  hook_diversity: number;
  format_diversity: number;
  ton_diversity: number;
  /** true si toutes les 3 diversités sont ≥ 3. */
  all_ok: boolean;
  /** Mentions retirées de la synthèse (count). */
  data_quality_sentences_stripped: number;
  /** true si on a inséré une phrase standardisée. */
  diversity_note_inserted: boolean;
  /** true si on a re-trié au moins un array. */
  reordered_top_hooks: boolean;
  reordered_top_formats: boolean;
  reordered_top_topic_clusters: boolean;
}

export interface PostProcessResult {
  trends: LinkedinTrends;
  stats: PostProcessStats;
}

const sortByEngagementDesc = <T extends { avg_engagement_norm: number }>(arr: T[]): T[] =>
  [...arr].sort((a, b) => b.avg_engagement_norm - a.avg_engagement_norm);

const sameOrder = <T extends { avg_engagement_norm: number }>(a: T[], b: T[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

/**
 * Post-traite la sortie Claude. Retourne un nouveau LinkedinTrends (pas
 * de mutation in-place) + des stats de transformation pour audit.
 */
export function postProcessTrends(trends: LinkedinTrends, inputs: TrendsInput): PostProcessResult {
  // A. Tri strict
  const top_hooks = sortByEngagementDesc(trends.top_hooks);
  const top_formats = sortByEngagementDesc(trends.top_formats);
  const top_topic_clusters = sortByEngagementDesc(trends.top_topic_clusters);

  // B. Diversités depuis inputs (source unique de vérité — pas Claude)
  const hook_diversity = new Set(inputs.post_analyses.map((p) => p.analysis.hook_type)).size;
  const format_diversity = new Set(inputs.post_analyses.map((p) => p.analysis.format)).size;
  const ton_diversity = new Set(inputs.post_analyses.map((p) => p.analysis.ton)).size;
  const all_ok = hook_diversity >= 3 && format_diversity >= 3 && ton_diversity >= 3;

  // C / D. Traitement synthèse
  let synthese_textuelle = trends.synthese_textuelle;
  let dataQualitySentencesStripped = 0;
  let diversityNoteInserted = false;

  if (all_ok) {
    // Strip toute mention data quality
    const sentencesBefore = splitSentences(synthese_textuelle).length;
    synthese_textuelle = stripDataQualitySentences(synthese_textuelle);
    const sentencesAfter = splitSentences(synthese_textuelle).length;
    dataQualitySentencesStripped = Math.max(0, sentencesBefore - sentencesAfter);
  } else if (!hasDiversityMention(synthese_textuelle)) {
    // Insérer phrase standardisée si pas déjà mentionnée
    const note = buildDiversityNote(hook_diversity, format_diversity, ton_diversity);
    synthese_textuelle = `${note} ${synthese_textuelle}`.trim();
    diversityNoteInserted = true;
  }

  const stats: PostProcessStats = {
    hook_diversity,
    format_diversity,
    ton_diversity,
    all_ok,
    data_quality_sentences_stripped: dataQualitySentencesStripped,
    diversity_note_inserted: diversityNoteInserted,
    reordered_top_hooks: !sameOrder(trends.top_hooks, top_hooks),
    reordered_top_formats: !sameOrder(trends.top_formats, top_formats),
    reordered_top_topic_clusters: !sameOrder(trends.top_topic_clusters, top_topic_clusters),
  };

  return {
    trends: {
      ...trends,
      top_hooks,
      top_formats,
      top_topic_clusters,
      synthese_textuelle,
    },
    stats,
  };
}
