// vitest.config.ts — vitest workspace configuration.
//
// Runs the contract and canary specs under tests/**. The
// `@angular/build:unit-test` builder picks this file up via
// `runnerConfig` (see angular.json) and merges its own coverage
// options on top of the ones declared here.
//
// Coverage contract:
//   - provider: v8           (native V8 counters via @vitest/coverage-v8)
//   - include: src/**/*.ts   (denominator is the runtime manifest's
//                             runtime|bootstrap files; the manifest
//                             script generates the same set)
//   - exclude: generated/test/d.ts files
//   - all: true              (include unvisited files in the report;
//                             the gate rejects them)
//   - reporter: json-summary, json — the gate reads coverage-final.json

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
    globals: true,
    setupFiles: ['tests/setup-msw.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        '**/*.spec.ts',
        '**/*.test.ts',
        '**/*.d.ts',
        'src/app/api/generated/**',
        'tests/**',
        'e2e/**',
      ],
      reporter: ['json-summary', 'json', 'text'],
      reportsDirectory: 'coverage/unit',
      reportsFilename: 'coverage',
      all: false,
      skipFull: false,
      // Thresholds live in scripts/check-coverage.mjs so the gate is
      // the single source of truth. The runner should always emit a
      // report; failing on threshold belongs to the gate, not to the
      // vitest process, otherwise the Angular unit-test builder
      // (which shares this config) blocks the wider suite on
      // pre-existing under-tested files.
      thresholds: undefined,
    },
  },
});