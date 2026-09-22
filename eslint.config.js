// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const eslintConfigPrettier = require('eslint-config-prettier/flat');

module.exports = defineConfig([
  {
    files: ['src/**/*.ts', 'projects/**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      angular.configs.tsRecommended,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: ['app', 'pay'],
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: ['app', 'pay'],
          style: 'kebab-case',
        },
      ],
      // Forbid legacy `@Input()` / `@Output()` decorators in favor of the
      // signal-based input() / output() / model() APIs. Backed by
      // T01-AC03.
      '@angular-eslint/prefer-signals': 'error',
      // Conventional guard / handler signatures take parameters the body
      // does not consume; the `_`-prefix is the project convention to
      // mark them as intentional. Mirror the same pattern for all source
      // files so CanMatchFn / CanActivateFn can keep their unused
      // injected params without tripping the rule.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    // FIX-69 widens `lintFilePatterns` (angular.json) to include `tests/**/*.ts`.
    // That tree does not belong to a TypeScript project (tsconfig.app.json and
    // tsconfig.spec.json both include only `src/`), so this block gives ESLint
    // the non-type-aware presets rather than the type-aware `extends` above —
    // without a matching block at all, ESLint reports "File ignored because no
    // matching configuration was supplied" for every file in this tree and the
    // widening buys nothing. This block carries no rule of its own.
    files: ['tests/**/*.ts'],
    extends: [eslint.configs.recommended, tseslint.configs.recommended],
  },
  {
    // Playwright end-to-end tests: Node code driving a browser, not part of
    // the Angular program, so not in the src/** or projects/** blocks.
    // This block is the dual of the one in eslint.config.mjs: the .js file
    // is the one ESLint 10 flat-config discovery picks up by default
    // (existed before the .mjs was introduced), so the e2e rules have to
    // live here too, otherwise `ng lint` reports playwright.config.ts as
    // "no matching configuration".
    files: ['e2e/**/*.ts', 'playwright.config.ts'],
    ignores: ['e2e/seed.spec.ts'],
    extends: [eslint.configs.recommended, tseslint.configs.recommended],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: __dirname } },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@playwright/test',
              importNames: ['test'],
              message: 'Import `test` from e2e/fixtures/coverage so the V8 coverage fixture runs.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='reload']",
          message: 'page.reload() is banned here. Use page.goto(page.url()). See e2e/seed.spec.ts.',
        },
        {
          selector: "CallExpression[callee.property.name='waitForTimeout']",
          message: 'No hard waits. Use a web-first assertion or expect.toPass().',
        },
      ],
    },
  },
  { files: ['e2e/fixtures/**/*.ts'], rules: { 'no-restricted-imports': 'off' } },
  { files: ['e2e/seed.spec.ts'], rules: {} },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {
      // Disallow the legacy `*ngIf` / `*ngFor` / `*ngSwitch` structural
      // directives. Modern Angular code uses the native `@if` / `@for` /
      // `@switch` blocks (T01-AC03 + T01-G03).
      '@angular-eslint/template/prefer-control-flow': 'error',
    },
  },
  eslintConfigPrettier,
  {
    // ng-openapi-gen writes an `/* eslint-disable */` header into every
    // generated file; the header stays as generated, so its report as an
    // unused directive is off for this folder only.
    files: ['src/app/api/generated/**/*.ts'],
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },
]);
