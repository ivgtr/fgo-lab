import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';
import {
  ALL_TEST_INCLUDES,
  AUDIT_TEST_INCLUDES,
  PRODUCTION_TEST_INCLUDES,
} from './scripts/test-suites.mjs';

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
          exclude: [...configDefaults.exclude, ...PRODUCTION_TEST_INCLUDES, ...AUDIT_TEST_INCLUDES],
          // Bound CPU contention for exhaustive candidate oracles while preserving the shared 5s
          // timeout; oversubscribing all cores makes their runtime depend on unrelated test files.
          maxWorkers: 4,
          sequence: { groupOrder: 0 },
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'production',
          include: PRODUCTION_TEST_INCLUDES,
          // Published-master suites are CPU-bound and each parse a large artifact. Capping the
          // worker share bounds concurrent first parses as well as suite-local shared setup, keeping
          // the unchanged 5s test ratchet stable after canonical quantity validation.
          maxWorkers: '50%',
          // Keep the differently capped project out of the unit project's concurrent worker group.
          sequence: { groupOrder: 1 },
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'audit',
          include: AUDIT_TEST_INCLUDES,
          maxWorkers: 1,
          sequence: { groupOrder: 2 },
          testTimeout: 180_000,
        },
      },
    ],
  },
});
