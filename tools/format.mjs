#!/usr/bin/env node
/**
 * Wrapper for `biome format` that accepts a Prettier-style `--check` flag.
 *
 *   pnpm format             → biome format --write .   (auto-fix)
 *   pnpm format --check     → biome format .           (check only, exits non-zero on diff)
 *
 * Biome 1.x does not natively support `--check` on `format`; this script
 * normalises the flag so CI commands written in Prettier convention work.
 */
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const isCheck = args.includes('--check');
const biomeArgs = isCheck ? ['format', '.'] : ['format', '--write', '.'];

const result = spawnSync('pnpm', ['exec', 'biome', ...biomeArgs], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
