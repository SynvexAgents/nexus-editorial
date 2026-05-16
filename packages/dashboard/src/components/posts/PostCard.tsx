import { Link } from 'react-router-dom';
import type { TimingRecommendation, VisualDecision, WeeklyWinner } from '../../lib/types';
import { ARCHETYPE_LABELS, CHECKLIST_LABELS, ICP_LABELS, LONGUEUR_LABELS } from '../../lib/types';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { Tag } from '../ui/Tag';
import { TimingBadge } from './TimingBadge';

interface PostCardProps {
  weekId: string;
  winner: WeeklyWinner;
  archetype: import('../../lib/types').Archetype;
  icp: import('../../lib/types').Icp;
  longueurCible: import('../../lib/types').LongueurCible;
  visual: VisualDecision | undefined;
  timing: TimingRecommendation | undefined;
}

export function PostCard(props: PostCardProps): JSX.Element {
  const { weekId, winner, archetype, icp, longueurCible, visual, timing } = props;
  const checklist = winner.checklist_qualite_passee;
  const checklistKeys: Array<keyof typeof checklist> = [
    'anti_cliche_ok',
    'ancrage_actu_assurance_ok',
    'ton_synvex_ok',
    'longueur_alignee_tendance_ok',
    'absence_survente_ok',
    'vocabulaire_metier_ok',
  ];

  return (
    <Card padded={false} className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-3 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <Tag>Post {winner.post_position}</Tag>
          <Badge tone="violet">{ARCHETYPE_LABELS[archetype]}</Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Tag>{ICP_LABELS[icp]}</Tag>
          <span className="text-ink-muted text-[11px]">·</span>
          <Tag>{LONGUEUR_LABELS[longueurCible]}</Tag>
        </div>
        <TimingBadge timing={timing} />
        {visual?.visual_recommended ? (
          <div>
            <Badge tone="neutral">Visuel : {visual.visual_type.replace('_', ' ')}</Badge>
          </div>
        ) : null}
      </div>

      <div className="flex-1 px-4 py-4 text-sm leading-relaxed text-ink-primary">
        <p className="line-clamp-6 italic">« {winner.post_final.slice(0, 240).trim()}… »</p>
      </div>

      <div className="px-4 pb-3">
        <div className="flex flex-wrap gap-1.5">
          {checklistKeys.map((k) => {
            const ok = checklist[k];
            return (
              <span
                key={k}
                title={CHECKLIST_LABELS[k]}
                className={`inline-flex items-center justify-center h-5 w-5 rounded text-[10px] font-semibold ${
                  ok
                    ? 'bg-accent-success-bg text-accent-success'
                    : 'bg-accent-danger-bg text-accent-danger'
                }`}
              >
                {ok ? '✓' : '✗'}
              </span>
            );
          })}
        </div>
      </div>

      <div className="px-4 pb-4 pt-1 border-t border-border">
        <Link
          to={`/week/${weekId}/post/${winner.post_position}`}
          className="text-sm text-accent-violet hover:underline"
        >
          Voir le post complet →
        </Link>
      </div>
    </Card>
  );
}
