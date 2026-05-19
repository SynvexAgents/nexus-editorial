// supabase/functions/_shared/auth.ts
// Vérification du bearer token entre n8n et les Edge Functions.
// Le token est partagé : n8n l'envoie dans Authorization: Bearer <token>,
// la function le compare au secret NEXUS_API_TOKEN.

import { errorResponse } from './cors.ts';

/**
 * Vérifie l'authentification de la requête. Retourne null si OK,
 * sinon une Response 401 prête à retourner.
 *
 * Le token attendu est dans Deno.env.NEXUS_API_TOKEN.
 * Si la variable n'est pas définie côté Supabase, on refuse TOUTE
 * requête (fail-closed) plutôt que de l'accepter (fail-open).
 */
export function verifyAuth(req: Request): Response | null {
  const expected = Deno.env.get('NEXUS_API_TOKEN');
  if (!expected) {
    return errorResponse('server_misconfigured: NEXUS_API_TOKEN not set', 500);
  }
  const header = req.headers.get('Authorization') ?? '';
  const got = header.replace(/^Bearer\s+/i, '').trim();
  if (got !== expected) {
    return errorResponse('unauthorized', 401);
  }
  return null;
}
