// Helpers de formatage UI. Pas de dépendance externe — la lib date-fns
// serait sur-dimensionnée pour ce qu'on fait (3-4 patterns).

export function formatProducedAt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatProducedAtShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function weekIdToReadable(weekId: string): string {
  // 2026-W20 → "Semaine 20 — 2026"
  const m = /^(\d{4})-W(\d{2})$/.exec(weekId);
  if (!m) return weekId;
  return `Semaine ${m[2]} — ${m[1]}`;
}

export function confidenceLabel(c: number): string {
  if (c >= 0.75) return 'Élevée';
  if (c >= 0.5) return 'Moyenne';
  return 'Faible';
}

export function pctClipped(n: number, total: number): string {
  if (!total) return '0%';
  const pct = Math.round((n / total) * 100);
  return `${pct}%`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallthrough
  }
  // Fallback : textarea hidden + execCommand (legacy navigateurs).
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'absolute';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
