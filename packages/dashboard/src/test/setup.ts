import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Stub des variables d'env Vite pour les tests Vitest (jsdom).
const env = import.meta.env as Record<string, string>;
if (!env.VITE_SUPABASE_URL) env.VITE_SUPABASE_URL = 'http://localhost:54321';
if (!env.VITE_SUPABASE_ANON_KEY) env.VITE_SUPABASE_ANON_KEY = 'test-anon-key';

// Stub navigator.clipboard pour les tests de copy. On expose le spy en
// global pour que les tests puissent l'asserter sans dépendre du getter
// `navigator.clipboard` (qui est readonly sur jsdom récent).
export const clipboardWriteTextSpy = vi.fn().mockResolvedValue(undefined);
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: clipboardWriteTextSpy,
    readText: vi.fn().mockResolvedValue(''),
  },
  configurable: true,
  writable: true,
});
// Globale aussi pour rester accessible depuis n'importe quel test.
(
  globalThis as unknown as { __clipboardWriteText: typeof clipboardWriteTextSpy }
).__clipboardWriteText = clipboardWriteTextSpy;
