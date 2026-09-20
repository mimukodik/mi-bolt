// vitest.contract.config.ts - the Node-only contract and isolation suite.
//
// `docs/spec/architecture.md:101` keeps shared and contract fixtures at
// the top level. Run with `npx vitest run --config vitest.contract.config.ts`
// - this suite has no npm script of its own, since the npm scripts were
// pruned to the stack's standard commands only. They
// are not Angular component tests: they read the OpenAPI document, drive
// the generated SDK over MSW's Node server and prove the unhandled-request
// policy. `ng test` cannot reach them, because its discovery globs run with
// cwd set to the project source root.
//
// No plugin belongs in this file. If a spec here needs the Angular
// compiler, it belongs beside the code it tests, under src/.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
    globals: true,
    setupFiles: ['tests/setup-msw.ts'],
  },
});
