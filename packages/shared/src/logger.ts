import pino, { type Logger as PinoLogger } from 'pino';

const level = process.env.LOG_LEVEL ?? 'info';

export const logger: PinoLogger = pino({
  level,
  base: {
    service: 'nexus-editorial',
    env: process.env.NODE_ENV ?? 'development',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = PinoLogger;

export function createChildLogger(bindings: Record<string, unknown>): PinoLogger {
  return logger.child(bindings);
}
