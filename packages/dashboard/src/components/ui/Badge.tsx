import type { ReactNode } from 'react';

type Tone = 'neutral' | 'violet' | 'success' | 'warning' | 'danger';

interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}

const tones: Record<Tone, string> = {
  neutral: 'bg-bg-tertiary text-ink-secondary border-border',
  violet: 'bg-accent-violet-bg text-accent-violet border-accent-violet/30',
  success: 'bg-accent-success-bg text-accent-success border-accent-success/30',
  warning: 'bg-accent-warning-bg text-accent-warning border-accent-warning/30',
  danger: 'bg-accent-danger-bg text-accent-danger border-accent-danger/30',
};

export function Badge({ tone = 'neutral', children, className = '' }: BadgeProps): JSX.Element {
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
