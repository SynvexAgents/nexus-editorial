import { Link, useParams } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { PostCard } from '../components/posts/PostCard';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { useWeeklyReport } from '../hooks/useWeeklyReport';
import { formatProducedAt, weekIdToReadable } from '../lib/format';

export function WeekPage(): JSX.Element {
  const { weekId } = useParams<{ weekId: string }>();
  const { report, loading, error } = useWeeklyReport(weekId);

  return (
    <AppShell
      title={weekId ? weekIdToReadable(weekId) : 'Semaine'}
      subtitle={
        report?.produced_at
          ? `Pipeline généré le ${formatProducedAt(report.produced_at)}`
          : undefined
      }
    >
      <div className="mb-4">
        <Link to="/" className="text-sm text-ink-secondary hover:text-ink-primary">
          ← Toutes les semaines
        </Link>
      </div>

      {error ? (
        <Card className="border-accent-danger/40">
          <p className="text-sm text-accent-danger">Erreur : {error}</p>
        </Card>
      ) : null}

      {loading ? <Skeleton /> : null}

      {!loading && !report ? (
        <Card>
          <p className="text-ink-primary">Pas de rapport pour cette semaine.</p>
        </Card>
      ) : null}

      {report ? <ReportContent report={report} weekId={weekId ?? ''} /> : null}
    </AppShell>
  );
}

function ReportContent({
  report,
  weekId,
}: {
  report: import('../lib/types').WeeklyReportRow;
  weekId: string;
}): JSX.Element {
  const winners = [...(report.winners_json ?? [])].sort(
    (a, b) => a.post_position - b.post_position,
  );
  const angles = report.angles_json ?? [];
  const visuals = report.visuals_json ?? [];
  const timing = report.timing_json ?? [];
  const angleById = new Map(angles.map((a) => [a.angle_id, a]));
  const visByPos = new Map(visuals.map((v) => [v.post_position, v]));
  const timeByPos = new Map(timing.map((t) => [t.post_position, t]));

  const synth = report.linkedin_trends_json?.synthese_textuelle ?? null;
  const validated = report.human_validated ?? false;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={winners.length === 3 ? 'success' : 'warning'}>
          {winners.length} / 3 posts
        </Badge>
        <Badge tone={validated ? 'success' : 'neutral'}>{validated ? 'Validé' : 'À valider'}</Badge>
      </div>

      {synth ? (
        <Card>
          <h3 className="text-xs uppercase tracking-wide text-ink-secondary mb-2">
            Synthèse LinkedIn FR
          </h3>
          <p className="text-sm leading-relaxed text-ink-primary line-clamp-3">{synth}</p>
        </Card>
      ) : null}

      {winners.length === 0 ? (
        <Card>
          <p className="text-ink-secondary text-sm">Aucun winner produit pour cette semaine.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {winners.map((w) => {
            const lookupId = w.fusion_used === false ? w.winner_id : w.fusion_used[0];
            const angle = angleById.get(lookupId);
            return (
              <PostCard
                key={w.post_position}
                weekId={weekId}
                winner={w}
                archetype={angle?.archetype ?? 'constat_lucide'}
                icp={angle?.icp_vise ?? 'courtier'}
                longueurCible={angle?.longueur_cible ?? 'moyen'}
                visual={visByPos.get(w.post_position)}
                timing={timeByPos.get(w.post_position)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function Skeleton(): JSX.Element {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {['a', 'b', 'c'].map((slot) => (
        <Card key={`skel-${slot}`} className="h-72">
          <div className="h-4 w-32 bg-bg-tertiary rounded animate-pulse" />
          <div className="mt-3 h-3 w-full bg-bg-tertiary/60 rounded animate-pulse" />
          <div className="mt-2 h-3 w-3/4 bg-bg-tertiary/60 rounded animate-pulse" />
        </Card>
      ))}
    </div>
  );
}
