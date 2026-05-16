import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAngle, makeReport, makeTiming, makeVisual, makeWinner } from './fixtures';

// Mock format.ts pour spy `copyToClipboard` directement (plus simple que
// stub navigator.clipboard sur jsdom). `vi.hoisted` permet de définir le
// spy avant le hoist de vi.mock.
const { copySpy } = vi.hoisted(() => ({ copySpy: vi.fn().mockResolvedValue(true) }));
vi.mock('../lib/format', async () => {
  const actual = await vi.importActual<typeof import('../lib/format')>('../lib/format');
  return { ...actual, copyToClipboard: copySpy };
});

// ---------------------------------------------------------------------------
// Mock du module supabase : retourne le state injecté avant chaque test.
// ---------------------------------------------------------------------------
let mockReports: ReturnType<typeof makeReport>[] = [];
let mockUpdateError: { message: string } | null = null;
let mockInsertError: { message: string } | null = null;
let lastInsertedPerf: Record<string, unknown> | null = null;

vi.mock('../lib/supabase', () => {
  const builder = (rows: unknown[]) => ({
    select: (_cols: string) => builder(rows),
    eq: (_col: string, val: unknown) => ({
      ...builder(rows),
      maybeSingle: async () => {
        const row = (rows as Array<{ week_id: string }>).find((r) => r.week_id === val) ?? null;
        return { data: row, error: null };
      },
    }),
    order: () => builder(rows),
    limit: (n: number) => ({
      ...builder(rows),
      // biome-ignore lint/suspicious/noThenProperty: thenable volontaire — émule l'API Supabase qui retourne un PostgrestBuilder thenable.
      then: (cb: (r: { data: unknown[]; error: null }) => void) => {
        cb({ data: rows.slice(0, n), error: null });
        return Promise.resolve({ data: rows.slice(0, n), error: null });
      },
    }),
  });

  return {
    supabase: {
      auth: {
        getSession: () =>
          Promise.resolve({ data: { session: { user: { email: 'marouane@test' } } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
        signInWithOtp: () => Promise.resolve({ error: null }),
        signOut: () => Promise.resolve({ error: null }),
      },
      from: (table: string) => {
        if (table === 'weekly_reports') {
          return {
            ...builder(mockReports as unknown as unknown[]),
            update: (_patch: unknown) => ({
              eq: async () => ({ error: mockUpdateError }),
            }),
          };
        }
        if (table === 'editorial_performance') {
          return {
            insert: async (row: Record<string, unknown>) => {
              lastInsertedPerf = row;
              return { error: mockInsertError };
            },
          };
        }
        return builder([]);
      },
    },
  };
});

import { PerformanceForm } from '../components/posts/PerformanceForm';
import { PostDetail } from '../components/posts/PostDetail';
// Imports APRÈS le vi.mock (sinon supabase serait importé sans mock).
import { HomePage } from '../pages/HomePage';
import { WeekPage } from '../pages/WeekPage';

beforeEach(() => {
  mockReports = [];
  mockUpdateError = null;
  mockInsertError = null;
  lastInsertedPerf = null;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HomePage', () => {
  it('renders empty state when no reports', async () => {
    mockReports = [];
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText(/Pas encore de semaine produite/i)).toBeInTheDocument(),
    );
  });

  it('renders week list with one report', async () => {
    mockReports = [makeReport({ week_id: '2026-W20' })];
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Semaine 20 — 2026')).toBeInTheDocument());
    expect(screen.getByText('1 / 3 posts')).toBeInTheDocument();
  });
});

describe('WeekPage', () => {
  it('renders 3 PostCards when 3 winners', async () => {
    const winners = [1, 2, 3].map((p) =>
      makeWinner({
        post_position: p as 1 | 2 | 3,
        winner_id: `W20-A${p}`,
        post_final: `Post ${p} avec ratio S/P et MGA dans le texte.`,
      }),
    );
    const angles = [1, 2, 3].map((p) => makeAngle({ angle_id: `W20-A${p}` }));
    mockReports = [
      makeReport({
        week_id: '2026-W20',
        angles_json: angles,
        winners_json: winners,
      }),
    ];
    render(
      <MemoryRouter initialEntries={['/week/2026-W20']}>
        <Routes>
          <Route path="/week/:weekId" element={<WeekPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Semaine 20 — 2026')).toBeInTheDocument());
    expect(screen.getByText('Post 1')).toBeInTheDocument();
    expect(screen.getByText('Post 2')).toBeInTheDocument();
    expect(screen.getByText('Post 3')).toBeInTheDocument();
  });
});

describe('PerformanceForm', () => {
  it('rejects submission with empty required fields', async () => {
    render(
      <PerformanceForm
        weekId="2026-W20"
        postPosition={1}
        winnerId="W20-A1"
        archetype="constat_lucide"
        icp="courtier"
      />,
    );
    const form = screen.getByTestId('perf-form') as HTMLFormElement;
    fireEvent.submit(form);
    // Validation côté client → pas d'insert tenté.
    await waitFor(() => expect(lastInsertedPerf).toBeNull());
  });

  it('inserts row when all required fields are valid integers', async () => {
    render(
      <PerformanceForm
        weekId="2026-W20"
        postPosition={1}
        winnerId="W20-A1"
        archetype="constat_lucide"
        icp="courtier"
      />,
    );
    // fireEvent.change est synchrone et plus déterministe que userEvent.type
    // pour des inputs contrôlés multiples.
    fireEvent.change(screen.getByLabelText(/Likes \(7j\)/), { target: { value: '42' } });
    fireEvent.change(screen.getByLabelText(/Commentaires \(7j\)/), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText(/Partages \(7j\)/), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/Impressions \(7j\)/), { target: { value: '1200' } });
    fireEvent.change(screen.getByLabelText(/DM reçus/), { target: { value: '1' } });
    fireEvent.submit(screen.getByTestId('perf-form'));
    await waitFor(() => expect(lastInsertedPerf).not.toBeNull(), { timeout: 3000 });
    expect(lastInsertedPerf?.likes_7d).toBe(42);
    expect(lastInsertedPerf?.post_position).toBe(1);
  });
});

describe('PostDetail — copy to clipboard', () => {
  it('writes post_final to navigator.clipboard when "Copier le post" is clicked', async () => {
    const user = userEvent.setup();
    const winner = makeWinner({ post_final: 'Le ratio S/P bouge sur les portefeuilles MRP.' });
    const angle = makeAngle({ angle_id: winner.winner_id });
    render(
      <MemoryRouter>
        <PostDetail
          weekId="2026-W20"
          winner={winner}
          underlyingAngle={angle}
          timing={makeTiming()}
          visual={makeVisual()}
          reportHumanValidated={false}
          reportHumanNotes={null}
        />
      </MemoryRouter>,
    );
    copySpy.mockClear();
    await user.click(screen.getByRole('button', { name: /Copier le post/i }));
    await waitFor(() =>
      expect(copySpy).toHaveBeenCalledWith('Le ratio S/P bouge sur les portefeuilles MRP.'),
    );
  });
});
