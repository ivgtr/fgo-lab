import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';
import {
  ALL_TEST_INCLUDES,
  AUDIT_TEST_INCLUDES,
  PRODUCTION_TEST_INCLUDES,
  UNIT_DIAGNOSTIC_TEST_INCLUDES,
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
          exclude: [
            ...configDefaults.exclude,
            ...PRODUCTION_TEST_INCLUDES,
            ...AUDIT_TEST_INCLUDES,
            ...UNIT_DIAGNOSTIC_TEST_INCLUDES,
          ],
          // Bound CPU contention for exhaustive candidate oracles while preserving the shared 5s
          // timeout; oversubscribing all cores makes their runtime depend on unrelated test files.
          maxWorkers: 4,
          sequence: { groupOrder: 0 },
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'unit-diagnostics',
          include: UNIT_DIAGNOSTIC_TEST_INCLUDES,
          // Complete fixture diagnostics are CPU/memory/I/O workloads, not additional audit scope.
          // Serialize their files after ordinary units while retaining the default 5s test timeout.
          maxWorkers: 1,
          sequence: { groupOrder: 1 },
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'production',
          include: PRODUCTION_TEST_INCLUDES,
          // Published-master suites each own a full validated graph. CPU percentage alone does
          // not budget their concurrent parse/freeze/compile memory and I/O. Run this workload
          // serially, preserving each suite's shared input and the unchanged 5s readiness budget.
          maxWorkers: 1,
          // Keep the differently capped project out of the unit project's concurrent worker group.
          sequence: { groupOrder: 2 },
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'audit',
          include: AUDIT_TEST_INCLUDES,
          maxWorkers: 1,
          sequence: { groupOrder: 3 },
          testTimeout: 180_000,
        },
      },
    ],
  },
});
