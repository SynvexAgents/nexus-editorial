import { useEffect, useState } from 'react';

// Système toast minimaliste : un seul toast à la fois, dispatch via
// fonction utilitaire `showToast`. Pas de provider, pas de portal —
// le toast vit dans le AppShell.

type ToastTone = 'success' | 'error' | 'info';
interface ToastEvent {
  message: string;
  tone: ToastTone;
  timeout?: number;
}

const listeners = new Set<(e: ToastEvent | null) => void>();

export function showToast(message: string, tone: ToastTone = 'info', timeout = 2500): void {
  for (const l of listeners) l({ message, tone, timeout });
}

const tones: Record<ToastTone, string> = {
  success: 'bg-accent-success-bg text-accent-success border-accent-success/50',
  error: 'bg-accent-danger-bg text-accent-danger border-accent-danger/50',
  info: 'bg-bg-tertiary text-ink-primary border-border',
};

export function ToastHost(): JSX.Element {
  const [current, setCurrent] = useState<ToastEvent | null>(null);

  useEffect(() => {
    let activeTimeout: ReturnType<typeof setTimeout> | null = null;
    const listener = (e: ToastEvent | null): void => {
      if (activeTimeout) clearTimeout(activeTimeout);
      setCurrent(e);
      if (e) {
        activeTimeout = setTimeout(() => setCurrent(null), e.timeout ?? 2500);
      }
    };
    listeners.add(listener);
    return () => {
      if (activeTimeout) clearTimeout(activeTimeout);
      listeners.delete(listener);
    };
  }, []);

  if (!current) return <span aria-live="polite" className="sr-only" />;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded border text-sm shadow-lg ${tones[current.tone]}`}
    >
      {current.message}
    </div>
  );
}
