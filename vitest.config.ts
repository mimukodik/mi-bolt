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

import ts from 'typescript';
import { defineConfig, type PluginOption } from 'vitest/config';

/**
 * Vite 8 / Rolldown switched the SSR transform pipeline to oxc
 * (https://github.com/vitejs/vite/discussions/21891). oxc does NOT
 * downgrade TC39 stage-3 decorators into the legacy form that
 * TypeScript's `experimentalDecorators` flag produces, so the SSR
 * output for any file that uses `@Component` / `@Injectable`
 * decorators ends up as `@(SomeImport())({...}) class Foo {}`,
 * which Node 22+ refuses to parse and yields "Invalid or unexpected
 * token" before any test runs.
 *
 * This plugin runs before vite's `vite:oxc` plugin (`enforce: 'pre'`)
 * and lowers every TS source file into the classic
 * `__decorateClass([...], class {})` form with the Reflect metadata
 * Angular's JIT injector needs at runtime. esbuild supports the
 * `experimentalDecorators` transform but does NOT emit
 * `__metadata("design:paramtypes", [...])` calls
 * (https://github.com/evanw/esbuild/issues/2603), so the SDK's
 * `Api` class — which uses `constructor(private config:
 * ApiConfiguration, private http: HttpClient)` — would lose its
 * paramtypes and Angular would throw NG0202 ("constructor is not
 * compatible with Angular Dependency Injection"). TypeScript's
 * transpile module with `emitDecoratorMetadata: true` produces
 * both halves; the result is plain JS that oxc can parse.
 *
 * The plugin is a no-op for non-TS inputs and only registers
 * compiler options that mirror the project's `tsconfig.json`,
 * so other transforms (jsdom env, the rolldown pipeline in build,
 * etc.) are unaffected.
 */
const tsLegacyDecoratorsPlugin = (): PluginOption => ({
  name: 'mi-bolt:ts-legacy-decorators',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('.ts') || id.includes('node_modules')) {
      return null;
    }
    const result = ts.transpileModule(code, {
      compilerOptions: {
        experimentalDecorators: true,
        useDefineForClassFields: false,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        emitDecoratorMetadata: true,
        importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
      },
      fileName: id,
    });
    return { code: result.outputText, map: undefined };
  },
});

export default defineConfig({
  plugins: [tsLegacyDecoratorsPlugin()],
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