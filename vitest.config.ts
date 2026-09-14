// vitest.config.ts — vitest workspace configuration.
//
// Picks up tsconfig.spec.json (which already declares the vitest/globals types
// and covers src/**/*.spec.ts) and additionally includes tests/**/*.spec.ts
// for the contract-layer tests T03 owns. The config file itself is small on
// purpose: no transforms, no globals, no environment shims.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
    globals: true,
  },
});