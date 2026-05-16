import { Link, useParams } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { PostDetail } from '../components/posts/PostDetail';
import { Card } from '../components/ui/Card';
import { useWeeklyReport } from '../hooks/useWeeklyReport';
import { weekIdToReadable } from '../lib/format';
import type { PostPosition } from '../lib/types';

export function PostPage(): JSX.Element {
  const { weekId, position } = useParams<{ weekId: string; position: string }>();
  const { report, loading, error } = useWeeklyReport(weekId);
  const positionNum = Number(position) as PostPosition;
  const positionValid = positionNum === 1 || positionNum === 2 || positionNum === 3;

  const winner = positionValid
    ? report?.winners_json?.find((w) => w.post_position === positionNum)
    : undefined;
  const angles = report?.angles_json ?? [];
  const lookupId = winner?.fusion_used === false ? winner?.winner_id : winner?.fusion_used?.[0];
  const angle = angles.find((a) => a.angle_id === lookupId);
  const visual = report?.visuals_json?.find((v) => v.post_position === positionNum);
  const timing = report?.timing_json?.find((t) => t.post_position === positionNum);

  return (
    <AppShell
      title={`Post ${position} · ${weekId ? weekIdToReadable(weekId) : ''}`}
      subtitle={angle ? `Archétype : ${angle.archetype}` : undefined}
    >
      <div className="mb-4 flex items-center gap-3">
        <Link to={`/week/${weekId}`} className="text-sm text-ink-secondary hover:text-ink-primary">
          ← Retour à la semaine
        </Link>
      </div>

      {error ? (
        <Card className="border-accent-danger/40">
          <p className="text-sm text-accent-danger">Erreur : {error}</p>
        </Card>
      ) : null}

      {loading ? <Card>Chargement…</Card> : null}

      {!loading && !positionValid ? (
        <Card>
          <p className="text-ink-primary">Position invalide. Choisissez 1, 2 ou 3.</p>
        </Card>
      ) : null}

      {!loading && positionValid && !winner ? (
        <Card>
          <p className="text-ink-primary">Pas de post à cette position pour la semaine {weekId}.</p>
        </Card>
      ) : null}

      {winner && weekId && report ? (
        <PostDetail
          weekId={weekId}
          winner={winner}
          underlyingAngle={angle}
          timing={timing}
          visual={visual}
          reportHumanValidated={report.human_validated}
          reportHumanNotes={report.human_notes}
        />
      ) : null}
    </AppShell>
  );
}
