import { useAuth } from '../../hooks/useAuth';
import { Button } from '../ui/Button';

interface HeaderProps {
  title?: string;
  subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps): JSX.Element {
  const { session, signOut } = useAuth();
  const email = session?.user?.email ?? null;

  return (
    <header className="flex items-center justify-between border-b border-border bg-bg-primary px-6 py-4">
      <div>
        {title ? <h1 className="text-lg font-semibold text-ink-primary">{title}</h1> : null}
        {subtitle ? <p className="text-xs text-ink-secondary mt-0.5">{subtitle}</p> : null}
      </div>
      <div className="flex items-center gap-3">
        {email ? (
          <span className="hidden sm:inline text-xs text-ink-secondary">{email}</span>
        ) : null}
        {session ? (
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            Se déconnecter
          </Button>
        ) : null}
      </div>
    </header>
  );
}
