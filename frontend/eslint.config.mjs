// @ts-check
// Renamed from eslint.config.js (CommonJS) to eslint.config.mjs when the
// baseline still loaded eslint-plugin-unicorn, which ships ESM-only. That
// plugin was dropped for the demo (see docs/lint-relaxations.md); the .mjs
// name stays because ESLint 10's flat-config loader resolves it
// automatically and no other tooling change is needed (MIM-209).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import unusedImports from 'eslint-plugin-unused-imports';
import security from 'eslint-plugin-security';
import playwright from 'eslint-plugin-playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// One app never imports another (MIM-414, requirement A-6): code two apps
// share lives in a library under projects/ and is imported through its alias.
const CROSS_APP_IMPORT_MESSAGE =
  'One app never imports another: move the shared code into a library under projects/ and import it through its alias.';

export default defineConfig([
  // Shared baseline ported from example-eslint.config.mjs (MIM-209): every
  // rule the source repo sets, at the same severity, minus the Nx-only
  // surface (no Nx workspace here) and the PrimeNG / *.feature.ts blocks
  // (no counterpart in this app). See the MIM-209 commit body and
  // eslint-inventory.md for the full adaptation notes.
  security.configs.recommended,
  {
    rules: {
      // Relaxed for the demo (MIM-209, docs/lint-relaxations.md): both flag
      // dynamic property/path access that this app uses deliberately (facet
      // maps, fixture loading) and add no real protection here.
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-fs-filename': 'off',
    },
  },
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'out-tsc/**',
      // Generated OpenAPI client; carries its own `/* eslint-disable */`
      // and is never hand-edited (MIM-209 step 3).
      'projects/storefront/src/app/api/generated/**',
      // The admin application's own generated OpenAPI client, same rules.
      'projects/admin/src/app/api/generated/**',
      'vitest.config.*',
      'vitest.*.config.*',
      'vitest.config.*.timestamp*',
      'tsconfig*.json',
      // Not source: docs/ carries the yettel.hu reference captures
      // (docs/design/yettel/**, several MB of static HTML) which the
      // unscoped `**/*.html` block below previously tried to lint as
      // Angular templates and stalled on. .angular/** and public/** are
      // build/static-asset directories, none of them app source either.
      'docs/**',
      '.angular/**',
      'public/**',
      'node_modules/**',
    ],
  },
  {
    files: ['projects/**/*.ts'],
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
    plugins: {
      'unused-imports': unusedImports,
    },
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: ['app', 'pay', 'adm'],
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: ['app', 'pay', 'adm'],
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
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // eslint-plugin-unused-imports (MIM-209): only the import-specific
      // rule is ported. `unused-imports/no-unused-vars` is NOT enabled
      // because it would replace the `@typescript-eslint/no-unused-vars`
      // pattern above, and the brief said to keep that pattern rather
      // than replace it.
      'unused-imports/no-unused-imports': 'error',
      // An Angular component or layout with a template and no members is an
      // empty class by design; the decorator is the exemption (MIM-220).
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      // Type-aware rules ported from example-eslint.config.mjs. These
      // live only in this projects/storefront/src/**/*.ts block (which has `projectService`)
      // and are deliberately NOT added to the tests/**/*.ts block below:
      // that tree is not included by any tsconfig (tsconfig.app.json /
      // tsconfig.spec.json both include only `src/`), so type-aware
      // parsing would fail there (see the FIX-69 comment on that block).
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        {
          allowString: false,
          allowNumber: false,
          allowNullableObject: false,
          allowNullableBoolean: false,
          allowNullableString: false,
          allowNullableNumber: false,
          allowAny: false,
        },
      ],
      '@typescript-eslint/no-for-in-array': 'error',
    },
  },
  {
    // FIX-69 widens `lintFilePatterns` (angular.json) to include `tests/**/*.ts`.
    // That tree does not belong to a TypeScript project (tsconfig.app.json and
    // tsconfig.spec.json both include only `src/`), so this block gives ESLint
    // the non-type-aware presets rather than the type-aware `extends` above —
    // without a matching block at all, ESLint reports "File ignored because no
    // matching configuration was supplied" for every file in this tree and the
    // widening buys nothing. The test-policy block further down covers this
    // tree as well.
    files: ['tests/**/*.ts'],
    extends: [eslint.configs.recommended, tseslint.configs.recommended],
  },
  {
    // Non-type-aware baseline ported from example-eslint.config.mjs's broad
    // `files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx']` block, scoped
    // to this app's two TypeScript trees (there are no .tsx/.js/.jsx
    // source files here). The Nx-only `@nx/enforce-module-boundaries` rule
    // from that block is dropped entirely: this is not an Nx workspace.
    files: ['projects/**/*.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'separate-type-imports',
        },
      ],
      '@typescript-eslint/explicit-member-accessibility': [
        'error',
        {
          accessibility: 'explicit',
          overrides: {
            accessors: 'no-public',
            constructors: 'no-public',
            methods: 'no-public',
            properties: 'off',
            parameterProperties: 'no-public',
          },
        },
      ],
      '@typescript-eslint/prefer-for-of': 'error',
      'arrow-body-style': ['error', 'as-needed'],
      'object-shorthand': 'error',
      '@typescript-eslint/adjacent-overload-signatures': 'error',
      '@typescript-eslint/class-literal-property-style': ['error', 'fields'],
      'no-promise-executor-return': ['error'],
      'no-unmodified-loop-condition': ['error'],
      curly: ['error'],
      'default-param-last': ['error'],
      eqeqeq: ['error', 'always'],
      'no-invalid-this': ['error'],
      'no-iterator': ['error'],
      // Relaxed for the demo (MIM-209, docs/lint-relaxations.md).
      'max-lines': 'off',
      'no-magic-numbers': 'off',
      'no-restricted-syntax': 'off',
      'max-lines-per-function': 'off',
      'no-void': 'off',
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'memberLike',
          modifiers: ['private'],
          format: ['camelCase'],
          leadingUnderscore: 'forbid',
        },
        {
          selector: 'memberLike',
          modifiers: ['private', 'static'],
          format: ['camelCase'],
          leadingUnderscore: 'forbid',
        },
        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },
        {
          selector: 'enum',
          format: ['PascalCase'],
        },
        {
          selector: 'interface',
          format: ['PascalCase'],
        },
        {
          selector: 'enumMember',
          format: ['PascalCase'],
        },
        {
          selector: 'typeAlias',
          format: ['PascalCase'],
        },
        {
          // PascalCase for type parameters (T, K, V, TKey, TValue)
          // — the standard TypeScript convention. The example-eslint
          // baseline's UPPER_CASE was wrong: it forces T_KEY over TKey.
          selector: 'typeParameter',
          format: ['PascalCase'],
        },
      ],
      '@typescript-eslint/array-type': [
        'error',
        {
          default: 'array',
          readonly: 'array',
        },
      ],
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
          allowDirectConstAssertionInArrowFunctions: true,
          allowConciseArrowFunctionExpressionsStartingWithVoid: true,
        },
      ],
      'no-constructor-return': ['error'],
      'no-self-compare': ['error'],
      'no-template-curly-in-string': ['error'],
      'no-unreachable-loop': ['error'],
      'default-case-last': ['error'],
      'no-caller': ['error'],
      'no-else-return': [
        'error',
        {
          allowElseIf: true,
        },
      ],
      'no-extend-native': ['error'],
      'no-lone-blocks': ['error'],
      'no-multi-assign': ['error'],
      'no-return-assign': ['error'],
      'no-sequences': ['error'],
      'no-useless-concat': ['error'],
      'operator-assignment': ['error', 'always'],
      'prefer-arrow-callback': ['error'],
      'require-await': ['error'],
      // Enforce return statements in array method callbacks
      'array-callback-return': [
        'error',
        {
          allowImplicit: false,
          checkForEach: true,
        },
      ],
      // Enforce minimum identifier length to prevent opaque abbreviations (e.g. ff, ds, ng).
      // Relaxed for the demo (MIM-209, docs/lint-relaxations.md).
      'id-length': 'off',
    },
  },
  {
    // Playwright end-to-end tests: Node code driving a browser, not part of
    // the Angular program, so not in the projects/storefront/src/** or tests/** blocks.
    files: ['e2e/**/*.ts', 'playwright.config.ts'],
    ignores: ['e2e/seed.spec.ts'],
    extends: [eslint.configs.recommended, tseslint.configs.recommended],
    plugins: { playwright },
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: __dirname } },
    rules: {
      // A focused or unconditionally skipped e2e test lets a failing
      // requirement pass. `test.skip(condition, reason)` and `test.fixme()`
      // stay allowed: Playwright's conditional skip, and the healer's
      // tracked outcome (playwright-tests skill).
      'playwright/no-focused-test': 'error',
      'playwright/no-skipped-test': ['error', { allowConditional: true }],
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
    // The admin has its own SDK and mocks (MIM-331); the root tsconfig's shop
    // aliases stay visible to it, so the linter keeps them out. The admin
    // also takes no type assertion at all (`as const` stays allowed).
    files: ['projects/admin/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@mi-bolt/api/*', '@mi-bolt/mocks/*', '**/src/app/api/generated/**'],
              message:
                'The shop SDK and mocks are not for the admin: use projects/admin/src/app/api/generated.',
            },
            {
              regex: '(^|/)(storefront|demo-payment)/',
              message: CROSS_APP_IMPORT_MESSAGE,
            },
          ],
        },
      ],
    },
  },
  {
    files: ['projects/storefront/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ regex: '(^|/)(admin|demo-payment)/', message: CROSS_APP_IMPORT_MESSAGE }] },
      ],
    },
  },
  {
    files: ['projects/demo-payment/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ regex: '(^|/)(storefront|admin)/', message: CROSS_APP_IMPORT_MESSAGE }] },
      ],
    },
  },
  {
    // The admin tag helper and the SDK-split spec (MIM-331) take no type
    // assertion either; the older contract suites are not covered yet.
    files: ['tests/contract/admin-tags.ts', 'tests/contract/sdk-split.spec.ts'],
    rules: {
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
    },
  },
  {
    files: ['**/*.spec.ts'],
    rules: {
      // Relaxed for the demo (MIM-209, docs/lint-relaxations.md).
      'max-lines-per-function': 'off',
    },
  },
  {
    // Test policy: a focused, skipped, placeholder or expected-to-fail
    // unit test lets a failing requirement pass silently. The projects/storefront/src/**
    // block switches no-restricted-syntax off; this block sets it again
    // for the spec files only.
    files: ['projects/**/*.spec.ts', 'tests/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          // On the property name, whatever the object: catches chains
          // (test.concurrent.only), aliases (t.only) and a runtime
          // ctx.skip().
          selector: 'MemberExpression[property.name=/^(only|skip|todo|fails|skipIf|runIf)$/]',
          message: 'A focused, skipped or placeholder test lets a failing requirement pass.',
        },
        {
          // A string key, whatever the object: it['only'],
          // describe.concurrent['skip'].
          selector:
            'MemberExpression[computed=true][property.value=/^(only|skip|todo|fails|skipIf|runIf)$/]',
          message: 'A focused, skipped or placeholder test lets a failing requirement pass.',
        },
        {
          // Any other computed key on the test API itself: it[`skip`],
          // test[key]. A computed key on an alias or a chain (t[key]) is
          // out of reach of a syntax rule.
          selector:
            "MemberExpression[computed=true][property.type!='Literal'][object.name=/^(describe|suite|it|test|bench)$/]",
          message: 'A focused, skipped or placeholder test lets a failing requirement pass.',
        },
        {
          // Destructuring: const { only } = it, const { 'only': x } = it,
          // and a test context taken apart as ({ skip }) => skip().
          selector:
            'ObjectPattern > Property[key.name=/^(only|skip|todo|fails|skipIf|runIf)$/], ObjectPattern > Property[key.value=/^(only|skip|todo|fails|skipIf|runIf)$/]',
          message: 'A focused, skipped or placeholder test lets a failing requirement pass.',
        },
      ],
    },
  },
  {
    // A coverage-ignore pragma removes lines from the coverage denominator
    // without a test; the deleted scripts/check-test-policy.mjs rejected
    // them, and production files are where they would count.
    files: ['projects/**/*.ts', 'tests/**/*.ts', 'e2e/**/*.ts'],
    rules: {
      'no-warning-comments': [
        'error',
        { terms: ['v8 ignore', 'istanbul ignore', 'c8 ignore'], location: 'anywhere' },
      ],
    },
  },
  {
    // Scoped to projects/storefront/src/**/*.html (not the source repo's unscoped `**/*.html`):
    // this app's docs/ tree carries several MB of static yettel.hu
    // reference captures and a docs/index.html, none of them Angular
    // templates, and a repo-wide glob sent the Angular template parser
    // into a multi-minute stall on docs/index.html (654 KB) during the
    // MIM-209 inventory run.
    files: ['projects/**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {
      // Disallow the legacy `*ngIf` / `*ngFor` / `*ngSwitch` structural
      // directives. Modern Angular code uses the native `@if` / `@for` /
      // `@switch` blocks (T01-AC03 + T01-G03).
      '@angular-eslint/template/prefer-control-flow': 'error',
      // Ported from example-eslint.config.mjs's html block (MIM-209).
      // eslint-plugin-angular-template-consistent-this itself is NOT
      // installed: its latest release (0.7.1, 2024-04-17) declares peer
      // `eslint: "^7.0.0 || ^8.0.0"` and peer
      // `@angular-eslint/template-parser: "^13.0.0 || ... || ^16.0.0"`,
      // neither of which covers this repo's ESLint 10 / angular-eslint
      // 22.5.0. Its one rule is listed under `blocked` in
      // eslint-inventory.md. The remaining rules below are angular-eslint's
      // own `template` rules (already installed, verified present in
      // angular-eslint 22.5.0) and carry no such conflict.
      '@angular-eslint/template/attributes-order': [
        'error',
        {
          alphabetical: true,
          order: [
            'STRUCTURAL_DIRECTIVE',
            'TEMPLATE_REFERENCE',
            'ATTRIBUTE_BINDING',
            'INPUT_BINDING',
            'TWO_WAY_BINDING',
            'OUTPUT_BINDING',
          ],
        },
      ],
      '@angular-eslint/template/no-duplicate-attributes': ['error'],
      '@angular-eslint/template/no-interpolation-in-attributes': ['error'],
      '@angular-eslint/template/prefer-self-closing-tags': ['error'],
      '@angular-eslint/template/prefer-static-string-properties': ['error'],
      '@angular-eslint/template/prefer-template-literal': ['error'],
      '@angular-eslint/template/button-has-type': ['error'],
      '@angular-eslint/template/no-any': ['error'],
    },
  },
  eslintConfigPrettier,
]);
