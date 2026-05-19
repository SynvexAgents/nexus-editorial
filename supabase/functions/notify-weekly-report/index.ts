// notify-weekly-report
// Endpoint POST. Lit weekly_reports pour week_id, vérifie 6 colonnes
// JSON présentes, compose subject+text+html, envoie via Resend API.
//
// Body : { week_id?: string }

import { verifyAuth } from '../_shared/auth.ts';
import { errorResponse, handleCorsPreflight, jsonResponse } from '../_shared/cors.ts';
import { getEnv, requireEnv } from '../_shared/env.ts';
import { logger } from '../_shared/logger.ts';
import type {
  InsuranceTrends,
  LinkedinTrends,
  TimingRecommendation,
  VisualDecision,
  WeeklyWinner,
  WeeklyWinners,
} from '../_shared/schemas.ts';
import { getSupabase } from '../_shared/supabase.ts';
import { currentIsoWeek } from '../_shared/week.ts';

interface ReportData {
  week_id: string;
  produced_at: string | null;
  linkedin_trends: LinkedinTrends | null;
  insurance_trends: InsuranceTrends | null;
  angles: unknown;
  winners: WeeklyWinners | null;
  visuals: VisualDecision[] | null;
  timing: TimingRecommendation[] | null;
}

function ensureComplete(d: ReportData): void {
  const missing: string[] = [];
  if (!d.linkedin_trends) missing.push('linkedin_trends_json');
  if (!d.insurance_trends) missing.push('insurance_trends_json');
  if (!d.angles) missing.push('angles_json');
  if (!d.winners || d.winners.length < 1) missing.push('winners_json');
  if (!d.visuals || d.visuals.length < 1) missing.push('visuals_json');
  if (!d.timing || d.timing.length < 1) missing.push('timing_json');
  if (missing.length > 0)
    throw new Error(`incomplete_report: missing columns [${missing.join(', ')}]`);
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

function composeWinnerLine(
  w: WeeklyWinner,
  t: TimingRecommendation | undefined,
  v: VisualDecision | undefined,
): string {
  const arch = w.fusion_used === false ? `(${w.winner_id})` : '(fusion)';
  const timingStr = t ? `${t.day_recommended} ${t.hour_recommended}` : '(timing manquant)';
  const visualStr = v?.visual_recommended ? ` · visuel ${v.visual_type}` : '';
  const excerpt = w.post_final.slice(0, 120).replace(/\s+/g, ' ').trim();
  return `Post ${w.post_position} ${arch} — ${w.longueur_finale}c — recommandé ${timingStr}${visualStr}\n    « ${excerpt}... »`;
}

function compose(
  d: ReportData,
  dashboardUrl: string,
): { subject: string; text: string; html: string } {
  ensureComplete(d);
  const winners = [...d.winners!].sort((a, b) => a.post_position - b.post_position);
  const timeByPos = new Map((d.timing ?? []).map((t) => [t.post_position, t]));
  const visByPos = new Map((d.visuals ?? []).map((v) => [v.post_position, v]));

  const subject = `Nexus Editorial — 3 posts prêts pour ${d.week_id}`;
  const winnerLines = winners
    .map((w) => composeWinnerLine(w, timeByPos.get(w.post_position), visByPos.get(w.post_position)))
    .join('\n\n');

  const tenBest = d.linkedin_trends!.ten_best_posts ?? [];
  const actu = d.insurance_trends!.actualites_majeures ?? [];
  const archCount = new Set(winners.map((w) => w.winner_id)).size;
  const visualsCount = (d.visuals ?? []).filter((v) => v.visual_recommended).length;

  const techLines = [
    `${tenBest.length} clean_posts dans le top LinkedIn de la semaine`,
    `${actu.length} actualités assurance majeures retenues`,
    `${archCount} winners distincts (8 angles candidats → 3 retenus)`,
    `${visualsCount}/${winners.length} visuels recommandés (Gamma prompts dans le dashboard)`,
  ];

  const text = `Bonjour Marouane,

Tes 3 posts LinkedIn de la semaine sont prêts à valider.

Résumé :

${winnerLines}

Ouvrir le dashboard pour validation : ${dashboardUrl}/week/${d.week_id}

Données techniques :
  - ${techLines.join('\n  - ')}

Le pipeline a tourné ${d.produced_at ? `le ${formatDate(d.produced_at)}` : 'récemment'}.

Bon dimanche,
Le système Nexus Editorial`;

  const postsHtml = winners
    .map((w) => {
      const t = timeByPos.get(w.post_position);
      const v = visByPos.get(w.post_position);
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
    .join('\n    ');

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8" /><style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #1a1d23; line-height: 1.55; max-width: 640px; margin: 0 auto; padding: 24px; }
    h1 { font-size: 18px; font-weight: 600; margin: 0 0 12px; color: #0d1117; }
    .post { border-left: 3px solid #2c3e50; padding: 10px 14px; margin: 12px 0; background: #f6f8fa; }
    .post-meta { font-size: 13px; color: #57606a; margin-bottom: 6px; }
    .post-excerpt { font-size: 14px; font-style: italic; }
    .cta { display: inline-block; background: #0d1117; color: #ffffff !important; padding: 10px 18px; border-radius: 4px; text-decoration: none; margin: 16px 0; }
    .tech { font-size: 13px; color: #57606a; background: #f6f8fa; padding: 12px; border-radius: 4px; }
    .footer { font-size: 12px; color: #8b949e; margin-top: 24px; }
    </style></head><body>
    <h1>Nexus Editorial — semaine ${d.week_id}</h1>
    <p>Bonjour Marouane,</p>
    <p>Vos 3 posts LinkedIn de la semaine sont prêts à valider.</p>
    ${postsHtml}
    <p><a class="cta" href="${dashboardUrl}/week/${d.week_id}">Ouvrir le dashboard</a></p>
    <div class="tech"><strong>Données techniques :</strong>
    <ul style="margin: 6px 0; padding-left: 18px;">
    ${techLines.map((l) => `<li>${escapeHtml(l)}</li>`).join('\n      ')}
    </ul></div>
    <p class="footer">${d.produced_at ? `Pipeline généré ${escapeHtml(formatDate(d.produced_at))}.` : ''} Le système Nexus Editorial.</p>
    </body></html>`;

  return { subject, text, html };
}

Deno.serve(async (req: Request) => {
  const cors = handleCorsPreflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);
  const authErr = verifyAuth(req);
  if (authErr) return authErr;

  const log = logger.child({ fn: 'notify-weekly-report' });
  const t0 = Date.now();

  try {
    const body = (await req.json().catch(() => ({}))) as { week_id?: string };
    const weekId = body.week_id ?? currentIsoWeek();
    const sb = getSupabase();

    const { data: row, error } = await sb
      .from('weekly_reports')
      .select(
        'week_id, produced_at, linkedin_trends_json, insurance_trends_json, angles_json, winners_json, visuals_json, timing_json',
      )
      .eq('week_id', weekId)
      .maybeSingle();
    if (error) return errorResponse(`select_failed: ${error.message}`, 500);
    if (!row) return errorResponse(`week_not_found: ${weekId}`, 404);

    const r = row as {
      week_id: string;
      produced_at: string | null;
      linkedin_trends_json: LinkedinTrends | null;
      insurance_trends_json: InsuranceTrends | null;
      angles_json: unknown;
      winners_json: WeeklyWinners | null;
      visuals_json: VisualDecision[] | null;
      timing_json: TimingRecommendation[] | null;
    };

    const data: ReportData = {
      week_id: r.week_id,
      produced_at: r.produced_at,
      linkedin_trends: r.linkedin_trends_json,
      insurance_trends: r.insurance_trends_json,
      angles: r.angles_json,
      winners: r.winners_json,
      visuals: r.visuals_json,
      timing: r.timing_json,
    };

    const dashboardUrl = getEnv('DASHBOARD_URL', 'https://nexus-editorial.lovable.app')!;
    const composed = compose(data, dashboardUrl);

    const apiKey = requireEnv('RESEND_API_KEY');
    const to = requireEnv('NOTIFY_EMAIL_TO');
    const from = getEnv('NOTIFY_EMAIL_FROM', 'onboarding@resend.dev')!;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to,
        subject: composed.subject,
        text: composed.text,
        html: composed.html,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return errorResponse(`resend_http_${res.status}: ${body.slice(0, 300)}`, 502);
    }
    const sendResult = (await res.json()) as { id?: string };

    const duration = Date.now() - t0;
    log.info({ week_id: weekId, resend_id: sendResult.id, duration_ms: duration }, 'notify_sent');

    return jsonResponse({
      sent: true,
      resend_id: sendResult.id,
      duration_ms: duration,
      week_id: weekId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'notify_failed');
    return errorResponse(msg, 500);
  }
});
