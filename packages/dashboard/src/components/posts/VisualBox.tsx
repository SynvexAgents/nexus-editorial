import { copyToClipboard } from '../../lib/format';
import type { VisualDecision } from '../../lib/types';
import { VISUAL_TYPE_LABELS } from '../../lib/types';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardTitle } from '../ui/Card';
import { showToast } from '../ui/Toast';

interface VisualBoxProps {
  visual: VisualDecision | undefined;
}

export function VisualBox({ visual }: VisualBoxProps): JSX.Element {
  if (!visual) {
    return (
      <Card>
        <CardTitle>Visuel</CardTitle>
        <p className="text-sm text-ink-secondary">Aucune décision visuelle disponible.</p>
      </Card>
    );
  }

  if (!visual.visual_recommended) {
    return (
      <Card>
        <CardTitle>Visuel</CardTitle>
        <div className="space-y-2">
          <Badge tone="neutral">Pas de visuel recommandé</Badge>
          <p className="text-sm text-ink-secondary leading-relaxed">{visual.visual_reason}</p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>Visuel</CardTitle>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge tone="violet">{VISUAL_TYPE_LABELS[visual.visual_type]}</Badge>
        </div>
        <p className="text-sm text-ink-secondary leading-relaxed">{visual.visual_reason}</p>
        <pre className="rounded border border-border bg-bg-tertiary/60 px-3 py-3 text-xs font-mono text-ink-primary whitespace-pre-wrap break-words max-h-72 overflow-y-auto">
          {visual.gamma_prompt}
        </pre>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={async () => {
              const ok = await copyToClipboard(visual.gamma_prompt);
              showToast(ok ? 'Prompt Gamma copié' : 'Échec copie', ok ? 'success' : 'error');
            }}
          >
            Copier le prompt Gamma
          </Button>
          <a
            href="https://gamma.app"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-ink-secondary underline underline-offset-2 hover:text-ink-primary"
          >
            Ouvrir Gamma.app ↗
          </a>
        </div>
      </div>
    </Card>
  );
}
