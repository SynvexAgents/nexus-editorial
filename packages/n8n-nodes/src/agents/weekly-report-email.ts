/**
 * weekly-report-email — compose le contenu de l'email récap dominical
 * Nexus Editorial. Pure function (pas d'I/O), facilement testable.
 *
 * Entrées : les 6 JSON colonnes de weekly_reports pour une week_id.
 * Sortie  : { subject, text, html, summary } prêts à envoyer via Resend.
 *
 * Throw si une colonne JSON critique manque (linkedin_trends, insurance_trends,
 * winners, visuals, timing). angles_json est requise mais on n'en sort
 * pas de contenu dans l'email — la validation strict s'applique quand même.
 */
import type {
  InsuranceTrends,
  LinkedinTrends,
  TimingRecommendation,
  VisualDecision,
  WeeklyWinner,
  WeeklyWinners,
} from '@nexus/shared';

export interface WeeklyReportData {
  week_id: string;
  produced_at: string | null;
  linkedin_trends: LinkedinTrends | null;
  insurance_trends: InsuranceTrends | null;
  angles: unknown;
  winners: WeeklyWinners | null;
  visuals: VisualDecision[] | null;
  timing: TimingRecommendation[] | null;
}

export interface ComposeEmailOptions {
  dashboard_url?: string;
}

export interface ComposeEmailOutput {
  subject: string;
  text: string;
  html: string;
}

/** Throw une erreur listant toutes les colonnes manquantes. */
function ensureCompleteReport(d: WeeklyReportData): void {
  const missing: string[] = [];
  if (!d.linkedin_trends) missing.push('linkedin_trends_json');
  if (!d.insurance_trends) missing.push('insurance_trends_json');
  if (!d.angles) missing.push('angles_json');
  if (!d.winners || d.winners.length < 1) missing.push('winners_json');
  if (!d.visuals || d.visuals.length < 1) missing.push('visuals_json');
  if (!d.timing || d.timing.length < 1) missing.push('timing_json');
  if (missing.length > 0) {
    throw new Error(`incomplete_report: missing columns [${missing.join(', ')}]`);
  }
}

/** Compose une ligne récap par winner (3 lignes attendues). */
function composeWinnerLine(
  winner: WeeklyWinner,
  timing: TimingRecommendation | undefined,
  visual: VisualDecision | undefined,
): string {
  const archetypeLabel = winner.fusion_used === false ? `(${winner.winner_id})` : '(fusion)';
  const timingStr = timing
    ? `${timing.day_recommended} ${timing.hour_recommended}`
    : '(timing manquant)';
  const visualStr = visual?.visual_recommended ? ` · visuel ${visual.visual_type}` : '';
  const excerpt = winner.post_final.slice(0, 120).replace(/\s+/g, ' ').trim();
  return `Post ${winner.post_position} ${archetypeLabel} — ${winner.longueur_finale}c — recommandé ${timingStr}${visualStr}\n    « ${excerpt}... »`;
}

/**
 * Compose une mini-section "données techniques" à partir des stats
 * non-LLM (volumes, archétypes, ICP).
 */
function composeTechSection(d: WeeklyReportData): string {
  const lt = d.linkedin_trends!;
  const it = d.insurance_trends!;
  const winners = d.winners!;
  const tenBest = lt.ten_best_posts ?? [];
  const actu = it.actualites_majeures ?? [];
  const archetypes = new Set(winners.map((w) => w.winner_id));
  return [
    `${tenBest.length} clean_posts dans le top LinkedIn de la semaine`,
    `${actu.length} actualités assurance majeures retenues`,
    `${archetypes.size} winners distincts (8 angles candidats → 3 retenus)`,
  ].join('\n  - ');
}

export function composeWeeklyReportEmail(
  data: WeeklyReportData,
  options: ComposeEmailOptions = {},
): ComposeEmailOutput {
  ensureCompleteReport(data);

  const dashboardUrl = options.dashboard_url ?? 'https://nexus-editorial.lovable.app';
  const winners = [...data.winners!].sort((a, b) => a.post_position - b.post_position);
  const timingByPos = new Map<number, TimingRecommendation>(
    (data.timing ?? []).map((t) => [t.post_position, t]),
  );
  const visualByPos = new Map<number, VisualDecision>(
    (data.visuals ?? []).map((v) => [v.post_position, v]),
  );

  const subject = `Nexus Editorial — 3 posts prêts pour ${data.week_id}`;

  const winnerLines = winners
    .map((w) =>
      composeWinnerLine(w, timingByPos.get(w.post_position), visualByPos.get(w.post_position)),
    )
    .join('\n\n');
  const techSection = composeTechSection(data);

  // Compte le nombre de visuels recommandés.
  const visualsCount = (data.visuals ?? []).filter((v) => v.visual_recommended).length;

  const text = `Bonjour Marouane,

Tes 3 posts LinkedIn de la semaine sont prêts à valider.

Résumé :

${winnerLines}

Ouvrir le dashboard pour validation : ${dashboardUrl}/week/${data.week_id}

Données techniques :
  - ${techSection}
  - ${visualsCount}/${winners.length} visuels recommandés (Gamma prompts dans le dashboard)

Le pipeline a tourné ${data.produced_at ? `le ${formatDate(data.produced_at)}` : 'récemment'}.

Bon dimanche,
Le système Nexus Editorial`;

  const html = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #1a1d23; line-height: 1.55; max-width: 640px; margin: 0 auto; padding: 24px; }
      h1 { font-size: 18px; font-weight: 600; margin: 0 0 12px; color: #0d1117; }
      .post { border-left: 3px solid #2c3e50; padding: 10px 14px; margin: 12px 0; background: #f6f8fa; }
      .post-meta { font-size: 13px; color: #57606a; margin-bottom: 6px; }
      .post-excerpt { font-size: 14px; font-style: italic; }
      .cta { display: inline-block; background: #0d1117; color: #ffffff !important; padding: 10px 18px; border-radius: 4px; text-decoration: none; margin: 16px 0; }
      .tech { font-size: 13px; color: #57606a; background: #f6f8fa; padding: 12px; border-radius: 4px; }
      .footer { font-size: 12px; color: #8b949e; margin-top: 24px; }
    </style>
  </head>
  <body>
    <h1>Nexus Editorial — semaine ${data.week_id}</h1>
    <p>Bonjour Marouane,</p>
    <p>Vos 3 posts LinkedIn de la semaine sont prêts à valider.</p>
    ${winners
      .map((w) => {
        const t = timingByPos.get(w.post_position);
        const v = visualByPos.get(w.post_position);
        const arch =
          w.fusion_used === false
            ? w.winner_id
            : `fusion ${(w.fusion_used as [string, string]).join('+')}`;
        const timingHtml = t
          ? `${escapeHtml(t.day_recommended)} ${escapeHtml(t.hour_recommended)}`
          : '(timing manquant)';
        const visualHtml = v?.visual_recommended ? ` · visuel ${escapeHtml(v.visual_type)}` : '';
        const excerpt = escapeHtml(w.post_final.slice(0, 220).replace(/\s+/g, ' ').trim());
        return `<div class="post">
      <div class="post-meta"><strong>Post ${w.post_position}</strong> · ${escapeHtml(arch)} · ${w.longueur_finale}c · ${timingHtml}${visualHtml}</div>
      <div class="post-excerpt">« ${excerpt}... »</div>
    </div>`;
      })
      .join('\n    ')}
    <p><a class="cta" href="${dashboardUrl}/week/${data.week_id}">Ouvrir le dashboard</a></p>
    <div class="tech">
      <strong>Données techniques :</strong>
      <ul style="margin: 6px 0; padding-left: 18px;">
        ${techSection
          .split('\n  - ')
          .map((line) => `<li>${escapeHtml(line)}</li>`)
          .join('\n        ')}
        <li>${visualsCount}/${winners.length} visuels recommandés (Gamma prompts dans le dashboard)</li>
      </ul>
    </div>
    <p class="footer">${data.produced_at ? `Pipeline généré ${escapeHtml(formatDate(data.produced_at))}.` : ''} Le système Nexus Editorial.</p>
  </body>
</html>`;

  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Paris',
    });
  } catch {
    return iso;
  }
}
