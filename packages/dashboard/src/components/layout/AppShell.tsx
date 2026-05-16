import type { ReactNode } from 'react';
import { ToastHost } from '../ui/Toast';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

interface AppShellProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
}

export function AppShell({ title, subtitle, children }: AppShellProps): JSX.Element {
  return (
    <div className="min-h-screen flex bg-bg-primary text-ink-primary">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <Header title={title} subtitle={subtitle} />
        <main className="flex-1 overflow-y-auto px-6 py-6">{children}</main>
      </div>
      <ToastHost />
    </div>
  );
}
