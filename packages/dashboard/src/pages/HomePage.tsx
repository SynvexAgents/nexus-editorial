import { Link } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { Tag } from '../components/ui/Tag';
import { useWeeklyReports } from '../hooks/useWeeklyReports';
import { formatProducedAtShort, weekIdToReadable } from '../lib/format';
import { ARCHETYPE_LABELS, type WeeklyReportRow } from '../lib/types';

export function HomePage(): JSX.Element {
  const { reports, loading, error } = useWeeklyReports(10);

  return (
    <AppShell
      title="Vos posts par semaine"
      subtitle="Sélectionnez une semaine pour ouvrir le détail."
    >
      {error ? (
        <Card className="border-accent-danger/40">
          <p className="text-sm text-accent-danger">Erreur de chargement : {error}</p>
        </Card>
      ) : null}

      {loading ? <SkeletonList /> : null}

      {!loading && reports.length === 0 ? <EmptyState /> : null}

      {!loading && reports.length > 0 ? (
        <ul className="space-y-3">
          {reports.map((r) => (
            <ReportRow key={r.week_id} report={r} />
          ))}
        </ul>
      ) : null}
    </AppShell>
  );
}

function ReportRow({ report }: { report: WeeklyReportRow }): JSX.Element {
  const winners = report.winners_json ?? [];
  const angles = report.angles_json ?? [];
  const angleById = new Map(angles.map((a) => [a.angle_id, a]));
  const validatedCount = report.human_validated ?? false ? winners.length : 0;
  const archetypes = winners
    .map((w) => {
      const id = w.fusion_used === false ? w.winner_id : w.fusion_used[0];
      return angleById.get(id)?.archetype;
    })
    .filter((a): a is import('../lib/types').Archetype => Boolean(a));

  return (
    <li>
      <Link
        to={`/week/${report.week_id}`}
        className="block group focus:outline-none focus:ring-2 focus:ring-accent-violet rounded-lg"
      >
        <Card
          padded={false}
          className="px-5 py-4 transition-colors group-hover:border-accent-violet/40"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-ink-primary">
                  {weekIdToReadable(report.week_id)}
                </h2>
                <Tag>{formatProducedAtShort(report.produced_at)}</Tag>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone={winners.length === 3 ? 'success' : 'warning'}>
                  {winners.length} / 3 posts
                </Badge>
                {validatedCount > 0 ? <Badge tone="success">Validé</Badge> : null}
                {archetypes.length > 0
                  ? archetypes.map((a, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: les archétypes peuvent se répéter sur la prévisualisation (fusion), index utile pour différencier.
                      <Tag key={`${a}-${i}`}>{ARCHETYPE_LABELS[a]}</Tag>
                    ))
                  : null}
              </div>
            </div>
            <span className="shrink-0 text-sm text-accent-violet group-hover:underline">
              Voir →
            </span>
          </div>
        </Card>
      </Link>
    </li>
  );
}

function SkeletonList(): JSX.Element {
  return (
    <ul className="space-y-3" aria-hidden="true">
      {['a', 'b', 'c'].map((slot) => (
        <li key={`skel-${slot}`}>
          <Card padded={false} className="px-5 py-4">
            <div className="h-4 w-40 bg-bg-tertiary rounded animate-pulse" />
            <div className="mt-3 h-3 w-64 bg-bg-tertiary/60 rounded animate-pulse" />
          </Card>
        </li>
      ))}
    </ul>
  );
}

function EmptyState(): JSX.Element {
  return (
    <Card className="text-center py-10">
      <p className="text-ink-primary text-base mb-1">Pas encore de semaine produite.</p>
      <p className="text-ink-secondary text-sm">
        Le pipeline tourne chaque samedi 22h (heure de Paris). La première semaine apparaîtra ici
        dès qu'elle aura été générée.
      </p>
    </Card>
  );
}
