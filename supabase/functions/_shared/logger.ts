// supabase/functions/_shared/logger.ts
// Logger structuré minimal pour les Edge Functions. JSON sur stdout
// (Supabase capture vers les logs Dashboard). Évite la dépendance pino
// qui ne supporte pas Deno proprement via esm.sh.

export interface Logger {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
  error: (obj: Record<string, unknown>, msg: string) => void;
  child: (base: Record<string, unknown>) => Logger;
}

function emit(
  level: 'info' | 'warn' | 'error',
  base: Record<string, unknown>,
  obj: Record<string, unknown>,
  msg: string,
): void {
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    service: 'nexus-editorial',
    runtime: 'edge',
    ...base,
    ...obj,
    msg,
  });
  // Edge runtime : console.log → captured. stderr pour erreurs.
  if (level === 'error') console.error(line);
  else console.log(line);
}

export function createLogger(base: Record<string, unknown> = {}): Logger {
  return {
    info: (obj, msg) => emit('info', base, obj, msg),
    warn: (obj, msg) => emit('warn', base, obj, msg),
    error: (obj, msg) => emit('error', base, obj, msg),
    child: (extra) => createLogger({ ...base, ...extra }),
  };
}

export const logger = createLogger();
