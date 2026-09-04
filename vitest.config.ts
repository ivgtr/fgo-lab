import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';
import { ALL_TEST_INCLUDES, PRODUCTION_TEST_INCLUDES } from './scripts/test-suites.mjs';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    coverage: { provider: 'v8', reporter: ['text', 'json', 'html'] },
    projects: [
      {
        plugins: [react()],
        test: {
          name: 'unit',
          include: ALL_TEST_INCLUDES,
          exclude: [...configDefaults.exclude, ...PRODUCTION_TEST_INCLUDES],
          sequence: { groupOrder: 0 },
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'production',
          include: PRODUCTION_TEST_INCLUDES,
          // Published-master suites are CPU-bound and each parse a large artifact. Capping the
          // worker share prevents file-level contention from violating the unchanged 5s test ratchet.
          maxWorkers: '75%',
          // Keep the differently capped project out of the unit project's concurrent worker group.
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
