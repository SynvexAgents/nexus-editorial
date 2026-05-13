import pino from 'pino';
import { describe, expect, it } from 'vitest';

describe('logger smoke', () => {
  it('emits a valid JSON line with the service field bound', () => {
    const lines: string[] = [];
    const stream = {
      write: (msg: string) => {
        lines.push(msg);
      },
    };

    const testLogger = pino(
      {
        level: 'info',
        base: { service: 'nexus-editorial', env: 'test' },
        timestamp: pino.stdTimeFunctions.isoTime,
      },
      stream as unknown as NodeJS.WritableStream,
    );

    testLogger.info({ run_id: 'w21-r1' }, 'agent_started');

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!);
    expect(parsed).toMatchObject({
      service: 'nexus-editorial',
      env: 'test',
      msg: 'agent_started',
      run_id: 'w21-r1',
    });
    expect(typeof parsed.time).toBe('string');
    expect(parsed.level).toBe(30);
  });
});
