import { copyToClipboard } from '../../lib/format';
import { Button } from '../ui/Button';
import { Card, CardTitle } from '../ui/Card';
import { showToast } from '../ui/Toast';

interface HookVariantsProps {
  variants: [string, string, string];
}

export function HookVariants({ variants }: HookVariantsProps): JSX.Element {
  return (
    <Card>
      <CardTitle>3 variantes de hook</CardTitle>
      <ol className="space-y-3">
        {variants.map((v, i) => (
          <li
            key={`hook-${i}-${v.slice(0, 8)}`}
            className="rounded border border-border bg-bg-tertiary/40 px-3 py-2.5 text-sm leading-relaxed text-ink-primary"
          >
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wide text-ink-secondary">
                Variante {String.fromCharCode(65 + i)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const ok = await copyToClipboard(v);
                  showToast(ok ? 'Hook copié' : 'Échec copie', ok ? 'success' : 'error');
                }}
              >
                Copier
              </Button>
            </div>
            <p>{v}</p>
          </li>
        ))}
      </ol>
    </Card>
  );
}
