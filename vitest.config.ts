import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Frontend unit/component tests for the Inertia web app (npm test).
 * Kept separate from vite.config.js so the Laravel plugin is not loaded.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['resources/js/**/*.test.{ts,tsx}'],
    setupFiles: ['resources/js/test/setup.ts'],
    globals: false,
  },
});
