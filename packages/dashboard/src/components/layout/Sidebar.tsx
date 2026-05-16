import { NavLink } from 'react-router-dom';

interface SidebarItem {
  label: string;
  to: string;
  enabled: boolean;
}

const ITEMS: SidebarItem[] = [
  { label: 'Semaines', to: '/', enabled: true },
  { label: 'Paramètres', to: '/settings', enabled: false },
];

export function Sidebar(): JSX.Element {
  return (
    <aside className="hidden md:flex md:w-56 lg:w-64 shrink-0 flex-col border-r border-border bg-bg-secondary">
      <div className="px-6 py-5 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent-violet" />
          <span className="font-semibold text-ink-primary">Nexus Editorial</span>
        </div>
        <div className="mt-1 text-xs text-ink-secondary">Synvex · review hebdo</div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {ITEMS.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.to === '/'}
            onClick={(e) => {
              if (!it.enabled) e.preventDefault();
            }}
            className={({ isActive }) =>
              [
                'block px-3 py-2 rounded text-sm transition-colors',
                !it.enabled
                  ? 'text-ink-muted cursor-not-allowed'
                  : isActive
                    ? 'bg-bg-tertiary text-ink-primary'
                    : 'text-ink-secondary hover:bg-bg-tertiary hover:text-ink-primary',
              ].join(' ')
            }
          >
            <span className="flex items-center justify-between">
              <span>{it.label}</span>
              {!it.enabled ? <span className="text-[10px] text-ink-muted">bientôt</span> : null}
            </span>
          </NavLink>
        ))}
      </nav>
      <div className="px-6 py-4 border-t border-border text-[11px] text-ink-muted leading-relaxed">
        Pipeline automatique · samedi 22h
        <br />
        Notification dimanche 8h
      </div>
    </aside>
  );
}
