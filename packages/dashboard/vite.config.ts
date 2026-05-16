import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Configuration Vite Nexus Editorial dashboard.
// Importable tel quel dans Lovable — pas de plugin custom, pas de
// pré-traitement spécifique.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: false },
  build: { outDir: 'dist', sourcemap: true },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
