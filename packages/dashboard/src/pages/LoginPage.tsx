import { useState } from 'react';
import { Button } from '../components/ui/Button';
import { Card, CardTitle } from '../components/ui/Card';
import { useAuth } from '../hooks/useAuth';

export function LoginPage(): JSX.Element {
  const { signInWithMagicLink } = useAuth();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    setError(null);
    const r = await signInWithMagicLink(email);
    setSubmitting(false);
    if (r.ok) setSent(true);
    else setError(r.error ?? 'Erreur inconnue');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary px-4">
      <Card className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent-violet" />
            <span className="font-semibold text-ink-primary">Nexus Editorial</span>
          </div>
          <p className="text-xs text-ink-secondary">Connexion par lien magique</p>
        </div>

        {sent ? (
          <div className="text-center space-y-2 py-4">
            <CardTitle>Lien envoyé</CardTitle>
            <p className="text-sm text-ink-primary">
              Un lien de connexion a été envoyé à <span className="font-mono">{email}</span>.
            </p>
            <p className="text-xs text-ink-secondary">
              Ouvrez-le depuis le même navigateur que cet onglet.
            </p>
          </div>
        ) : (
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
            <label className="block">
              <span className="text-xs text-ink-secondary mb-1.5 block">Email</span>
              <input
                type="email"
                required
                // biome-ignore lint/a11y/noAutofocus: page login dédiée, autofocus attendu utilisateur expert (single user).
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@synvex.fr"
                className="w-full rounded border border-border bg-bg-tertiary/40 px-3 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-accent-violet"
              />
            </label>
            {error ? <p className="text-xs text-accent-danger">{error}</p> : null}
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? 'Envoi…' : 'Recevoir le lien magique'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
