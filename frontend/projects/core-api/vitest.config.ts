import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      reportsDirectory: 'coverage/core-api',
      reportOnFailure: true,
    },
  },
});
