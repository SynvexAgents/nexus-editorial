import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Card, CardTitle } from '../ui/Card';
import { showToast } from '../ui/Toast';

interface ValidationToggleProps {
  weekId: string;
  initialValidated: boolean | null;
  initialNotes: string | null;
}

export function ValidationToggle({
  weekId,
  initialValidated,
  initialNotes,
}: ValidationToggleProps): JSX.Element {
  const [validated, setValidated] = useState(initialValidated ?? false);
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [saving, setSaving] = useState(false);

  // Reset si parent change de week_id (navigation entre semaines).
  // weekId est volontairement dans les deps : on reset le state local
  // quand on change de semaine même si initialValidated/Notes sont
  // identiques par hasard.
  // biome-ignore lint/correctness/useExhaustiveDependencies: weekId est volontaire pour trigger le reset.
  useEffect(() => {
    setValidated(initialValidated ?? false);
    setNotes(initialNotes ?? '');
  }, [weekId, initialValidated, initialNotes]);

  async function persist(next: { validated?: boolean; notes?: string }): Promise<void> {
    setSaving(true);
    const patch: { human_validated?: boolean; human_notes?: string } = {};
    if (next.validated !== undefined) patch.human_validated = next.validated;
    if (next.notes !== undefined) patch.human_notes = next.notes;
    const { error } = await supabase
      .from('weekly_reports')
      .update(patch as never)
      .eq('week_id', weekId);
    setSaving(false);
    if (error) showToast(`Erreur sauvegarde : ${error.message}`, 'error');
    else showToast('Validation enregistrée', 'success');
  }

  return (
    <Card>
      <CardTitle>Validation</CardTitle>
      <label className="flex items-center gap-3 cursor-pointer mb-3">
        <input
          type="checkbox"
          checked={validated}
          onChange={(e) => {
            const v = e.target.checked;
            setValidated(v);
            void persist({ validated: v });
          }}
          className="h-5 w-5 rounded border-border bg-bg-tertiary accent-accent-violet"
          disabled={saving}
        />
        <span className="text-sm text-ink-primary">
          Validé pour publication
          <span className="ml-2 text-xs text-ink-secondary">(commit immédiat)</span>
        </span>
      </label>
      <label className="block">
        <span className="text-xs text-ink-secondary mb-1.5 block">Notes (optionnel)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => void persist({ notes })}
          rows={3}
          placeholder="Remarques sur la semaine, corrections à apporter, etc."
          className="w-full rounded border border-border bg-bg-tertiary/40 px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-accent-violet"
          disabled={saving}
        />
      </label>
    </Card>
  );
}
