// Client Supabase — singleton réutilisable dans toute l'app.
// Lit depuis import.meta.env (Vite). Côté Lovable, ces vars sont
// configurées via l'UI projet.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anon) {
  // Le dashboard ne peut rien faire sans Supabase. On warn dans la
  // console pour aider Marouane au premier lancement (cf. .env.example).
  // eslint-disable-next-line no-console
  console.warn(
    '[Nexus] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquants. ' + 'Voir .env.example.',
  );
}

export const supabase = createClient<Database>(url ?? '', anon ?? '', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
