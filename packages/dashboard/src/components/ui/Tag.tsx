import type { ReactNode } from 'react';

// Tag = badge encore plus discret, pour métadonnées denses (ICP, longueur).
// Distinct visuellement du Badge (qui a une bordure + fond coloré).
interface TagProps {
  children: ReactNode;
  className?: string;
}

export function Tag({ children, className = '' }: TagProps): JSX.Element {
  return (
    <span
      className={`inline-flex items-center text-[11px] font-medium text-ink-secondary tracking-wide uppercase ${className}`}
    >
      {children}
    </span>
  );
}
