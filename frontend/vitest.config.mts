import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** Tests unitaires des composants : voir le guide Next.js local (app/guides/testing/vitest). */
export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
  },
});
