import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padded?: boolean;
}

export function Card({ children, padded = true, className = '', ...rest }: CardProps): JSX.Element {
  return (
    <div
      className={`rounded-lg border border-border bg-bg-secondary ${padded ? 'p-4' : ''} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

interface CardTitleProps {
  children: ReactNode;
  className?: string;
}

export function CardTitle({ children, className = '' }: CardTitleProps): JSX.Element {
  return (
    <h3
      className={`text-xs font-semibold uppercase tracking-wide text-ink-secondary mb-2 ${className}`}
    >
      {children}
    </h3>
  );
}
