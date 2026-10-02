import { defineConfig } from 'vitest/config';

const ci = Boolean(process.env['CI']);

export default defineConfig({
  test: {
    maxWorkers: ci ? undefined : 6,
    coverage: {
      reportsDirectory: 'coverage/unit',
      reportOnFailure: true,
    },
  },
});
