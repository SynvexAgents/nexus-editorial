import { copyToClipboard } from '../../lib/format';
import type { Angle, TimingRecommendation, VisualDecision, WeeklyWinner } from '../../lib/types';
import {
  ARCHETYPE_LABELS,
  CHECKLIST_LABELS,
  type ChecklistKey,
  ICP_LABELS,
  LONGUEUR_LABELS,
} from '../../lib/types';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardTitle } from '../ui/Card';
import { showToast } from '../ui/Toast';
import { HookVariants } from './HookVariants';
import { PerformanceForm } from './PerformanceForm';
import { TimingBadge } from './TimingBadge';
import { ValidationToggle } from './ValidationToggle';
import { VisualBox } from './VisualBox';

interface PostDetailProps {
  weekId: string;
  winner: WeeklyWinner;
  underlyingAngle: Angle | undefined;
  timing: TimingRecommendation | undefined;
  visual: VisualDecision | undefined;
  reportHumanValidated: boolean | null;
  reportHumanNotes: string | null;
}

export function PostDetail(props: PostDetailProps): JSX.Element {
  const {
    weekId,
    winner,
    underlyingAngle,
    timing,
    visual,
    reportHumanValidated,
    reportHumanNotes,
  } = props;
  const archetype = underlyingAngle?.archetype ?? 'constat_lucide';
  const icp = underlyingAngle?.icp_vise ?? 'courtier';
  const longueurCible = underlyingAngle?.longueur_cible ?? 'moyen';
  const checklist = winner.checklist_qualite_passee;
  const checklistKeys = Object.keys(checklist) as ChecklistKey[];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Colonne principale */}
      <div className="lg:col-span-3 space-y-4">
        <Card>
          <div className="flex items-center justify-between mb-3">
            <CardTitle>Post final · position {winner.post_position}</CardTitle>
            <span className="text-xs text-ink-secondary">{winner.longueur_finale} caractères</span>
          </div>
          <pre className="font-sans text-sm leading-relaxed text-ink-primary whitespace-pre-wrap rounded border border-border bg-bg-tertiary/40 p-4 max-h-[480px] overflow-y-auto">
            {winner.post_final}
          </pre>
          <div className="flex items-center gap-2 mt-3">
            <Button
              onClick={async () => {
                const ok = await copyToClipboard(winner.post_final);
                showToast(ok ? 'Post copié' : 'Échec copie', ok ? 'success' : 'error');
              }}
            >
              Copier le post
            </Button>
            <span className="text-xs text-ink-secondary">CTA : {winner.cta_recommande}</span>
          </div>
        </Card>

        <HookVariants variants={winner.hook_variantes} />

        <PerformanceForm
          weekId={weekId}
          postPosition={winner.post_position}
          winnerId={winner.winner_id}
          archetype={archetype}
          icp={icp}
        />
      </div>

      {/* Colonne side */}
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardTitle>Métadonnées</CardTitle>
          <dl className="space-y-2 text-sm">
            <MetaRow label="Archétype">
              <Badge tone="violet">{ARCHETYPE_LABELS[archetype]}</Badge>
            </MetaRow>
            <MetaRow label="ICP">
              <Badge tone="neutral">{ICP_LABELS[icp]}</Badge>
            </MetaRow>
            <MetaRow label="Longueur cible">
              <Badge tone="neutral">{LONGUEUR_LABELS[longueurCible]}</Badge>
            </MetaRow>
            <MetaRow label="Fusion">
              <span className="text-ink-primary">
                {winner.fusion_used === false
                  ? 'non'
                  : `${winner.fusion_used[0]} + ${winner.fusion_used[1]}`}
              </span>
            </MetaRow>
            <MetaRow label="Score">
              <span className="text-ink-primary">
                {winner.scoring[0]?.score_total?.toFixed?.(2) ?? '—'}
              </span>
            </MetaRow>
          </dl>
        </Card>

        <Card>
          <CardTitle>Timing</CardTitle>
          <div className="space-y-3">
            <TimingBadge timing={timing} />
            <p className="text-xs text-ink-secondary leading-relaxed">{timing?.rationale ?? '—'}</p>
            {timing ? (
              <div className="text-xs text-ink-secondary">
                Alternative :{' '}
                <span className="text-ink-primary">
                  {timing.alternative_slot.day} {timing.alternative_slot.hour}
                </span>
              </div>
            ) : null}
          </div>
        </Card>

        <VisualBox visual={visual} />

        <Card>
          <CardTitle>Auto-check qualité</CardTitle>
          <ul className="space-y-1.5 text-sm">
            {checklistKeys.map((k) => {
              const ok = checklist[k];
              return (
                <li key={k} className="flex items-center justify-between">
                  <span className="text-ink-secondary">{CHECKLIST_LABELS[k]}</span>
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-semibold ${
                      ok
                        ? 'bg-accent-success-bg text-accent-success'
                        : 'bg-accent-danger-bg text-accent-danger'
                    }`}
                  >
                    {ok ? '✓' : '✗'}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>

        <ValidationToggle
          weekId={weekId}
          initialValidated={reportHumanValidated}
          initialNotes={reportHumanNotes}
        />
      </div>
    </div>
  );
}

function MetaRow(props: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs uppercase tracking-wide text-ink-secondary">{props.label}</dt>
      <dd className="text-right">{props.children}</dd>
    </div>
  );
}
