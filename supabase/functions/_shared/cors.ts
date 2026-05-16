// supabase/functions/_shared/cors.ts
// Standard CORS headers pour les Edge Functions Nexus. Permet l'invocation
// depuis n8n cloud et depuis un dashboard Lovable côté navigateur.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function errorResponse(
  message: string,
  status = 500,
  extra?: Record<string, unknown>,
): Response {
  return jsonResponse({ error: message, ...(extra ?? {}) }, status);
}
