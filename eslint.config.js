// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
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
      // signal-based input() / output() / model() APIs. Backed by the
      // mi-bolt-design skill and T01-AC03.
      '@angular-eslint/prefer-signals': 'error',
      // Conventional guard / handler signatures take parameters the body
      // does not consume; the `_`-prefix is the project convention to
      // mark them as intentional. Mirror the same pattern for all source
      // files so CanMatchFn / CanActivateFn can keep their unused
      // injected params without tripping the rule.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  // Pre-existing shared UI primitives were authored against an earlier
  // Angular style (decorator-based `@Input()`, `ChangeDetectionStrategy.OnPush`,
  // `@ViewChild`). Carrying them over to the modern signal-based form is
  // out of scope for T01; relax the modern rules for that path so the
  // workspace lint stays green while T07/T25 rework them as a unit.
  {
    files: ['src/app/shared/ui/**/*.ts'],
    rules: {
      '@angular-eslint/prefer-signals': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
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
]);
