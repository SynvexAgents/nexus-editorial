import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-accent-violet text-white hover:bg-accent-violet/90 active:bg-accent-violet/80 border border-accent-violet',
  secondary: 'bg-bg-tertiary text-ink-primary hover:bg-bg-tertiary/80 border border-border',
  ghost:
    'bg-transparent text-ink-secondary hover:text-ink-primary hover:bg-bg-tertiary border border-transparent',
  danger: 'bg-accent-danger text-white hover:bg-accent-danger/90 border border-accent-danger',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonProps): JSX.Element {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
