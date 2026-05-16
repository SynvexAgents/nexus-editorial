import { type FormEvent, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Archetype, Icp, PostPosition } from '../../lib/types';
import { Button } from '../ui/Button';
import { Card, CardTitle } from '../ui/Card';
import { showToast } from '../ui/Toast';

interface PerformanceFormProps {
  weekId: string;
  postPosition: PostPosition;
  winnerId: string;
  archetype: Archetype;
  icp: Icp;
}

interface PerfState {
  likes: string;
  comments: string;
  reposts: string;
  impressions: string;
  dms: string;
  notes: string;
}

const DEFAULTS: PerfState = {
  likes: '',
  comments: '',
  reposts: '',
  impressions: '',
  dms: '',
  notes: '',
};

const intRegex = /^\d+$/;

function validate(s: PerfState): string | null {
  const required: Array<keyof PerfState> = ['likes', 'comments', 'reposts', 'impressions', 'dms'];
  for (const k of required) {
    if (s[k].trim() === '') return `Champ requis : ${k}`;
    if (!intRegex.test(s[k].trim())) return `Doit être un entier : ${k}`;
  }
  return null;
}

export function PerformanceForm({
  weekId,
  postPosition,
  winnerId,
  archetype,
  icp,
}: PerformanceFormProps): JSX.Element {
  const [state, setState] = useState<PerfState>(DEFAULTS);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof PerfState>(k: K, v: string): void {
    setState((s) => ({ ...s, [k]: v }));
  }

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    const err = validate(state);
    if (err) {
      showToast(err, 'error');
      return;
    }
    setSaving(true);
    const row = {
      week_id: weekId,
      post_position: postPosition,
      post_id_internal: winnerId,
      published_at: new Date().toISOString(),
      archetype,
      icp_vise: icp,
      likes_7d: Number(state.likes),
      comments_7d: Number(state.comments),
      reposts_7d: Number(state.reposts),
      impressions_7d: Number(state.impressions),
      dm_received: Number(state.dms),
      notes_qualite: state.notes || null,
    };
    const { error } = await supabase.from('editorial_performance').insert(row as never);
    setSaving(false);
    if (error) showToast(`Erreur : ${error.message}`, 'error');
    else {
      showToast('Performance enregistrée', 'success');
      setState(DEFAULTS);
    }
  }

  return (
    <Card>
      <CardTitle>Performance (post publication)</CardTitle>
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-3" data-testid="perf-form">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Likes (7j)" value={state.likes} onChange={(v) => set('likes', v)} />
          <Field
            label="Commentaires (7j)"
            value={state.comments}
            onChange={(v) => set('comments', v)}
          />
          <Field label="Partages (7j)" value={state.reposts} onChange={(v) => set('reposts', v)} />
          <Field
            label="Impressions (7j)"
            value={state.impressions}
            onChange={(v) => set('impressions', v)}
          />
          <Field label="DM reçus" value={state.dms} onChange={(v) => set('dms', v)} />
        </div>
        <label className="block">
          <span className="text-xs text-ink-secondary mb-1.5 block">Notes qualité</span>
          <textarea
            value={state.notes}
            onChange={(e) => set('notes', e.target.value)}
            rows={2}
            placeholder="Profil des engagés, ICP touchés, etc."
            className="w-full rounded border border-border bg-bg-tertiary/40 px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-accent-violet"
          />
        </label>
        <Button type="submit" disabled={saving} size="sm">
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </form>
    </Card>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}): JSX.Element {
  return (
    <label className="block">
      <span className="text-xs text-ink-secondary mb-1.5 block">{props.label}</span>
      <input
        type="text"
        inputMode="numeric"
        pattern="\\d*"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="w-full rounded border border-border bg-bg-tertiary/40 px-3 py-2 text-sm text-ink-primary focus:outline-none focus:border-accent-violet"
      />
    </label>
  );
}
