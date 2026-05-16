import { confidenceLabel } from '../../lib/format';
import type { TimingRecommendation } from '../../lib/types';
import { Badge } from '../ui/Badge';

interface TimingBadgeProps {
  timing: TimingRecommendation | undefined;
}

const dayFull: Record<string, string> = {
  Lun: 'Lundi',
  Mar: 'Mardi',
  Mer: 'Mercredi',
  Jeu: 'Jeudi',
  Ven: 'Vendredi',
};

export function TimingBadge({ timing }: TimingBadgeProps): JSX.Element {
  if (!timing) {
    return <Badge tone="neutral">Timing manquant</Badge>;
  }
  const tone =
    timing.confidence >= 0.75 ? 'success' : timing.confidence >= 0.5 ? 'violet' : 'warning';
  return (
    <Badge tone={tone}>
      {dayFull[timing.day_recommended] ?? timing.day_recommended} {timing.hour_recommended}
      <span className="ml-1.5 opacity-70">· {confidenceLabel(timing.confidence)}</span>
    </Badge>
  );
}
