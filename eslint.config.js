// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const eslintConfigPrettier = require('eslint-config-prettier/flat');

module.exports = defineConfig([
  {
    files: ['src/**/*.ts'],
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
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
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
    // FIX-69 widens `lintFilePatterns` (angular.json) to include `tests/**/*.ts`
    // and `e2e/**/*.ts`. Neither tree belongs to a TypeScript project
    // (tsconfig.app.json and tsconfig.spec.json both include only `src/`), so
    // this block gives ESLint the non-type-aware presets rather than the
    // type-aware `extends` above — without a matching block at all, ESLint
    // reports "File ignored because no matching configuration was supplied"
    // for every file in these two trees and the widening buys nothing. FIX-46
    // adds a second, later block matching these same two trees plus
    // `src/**/*.spec.ts` that carries the `no-restricted-syntax` test-policy
    // rule; this block carries no rule of its own.
    files: ['tests/**/*.ts', 'e2e/**/*.ts'],
    extends: [eslint.configs.recommended, tseslint.configs.recommended],
  },
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
]);
