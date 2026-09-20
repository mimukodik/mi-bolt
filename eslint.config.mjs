// @ts-check
// Renamed from eslint.config.js (CommonJS) to eslint.config.mjs because
// eslint-plugin-unicorn ships ESM-only ("type": "module", no `require`
// export condition) and cannot be `require()`'d. ESLint 10's flat-config
// loader resolves `eslint.config.mjs` automatically; no other tooling
// change is needed (MIM-209).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import unusedImports from 'eslint-plugin-unused-imports';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import security from 'eslint-plugin-security';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig([
  // Shared baseline ported from example-eslint.config.mjs (MIM-209): every
  // rule the source repo sets, at the same severity, minus the Nx-only
  // surface (no Nx workspace here) and the PrimeNG / *.feature.ts blocks
  // (no counterpart in this app). See the MIM-209 commit body and
  // eslint-inventory.md for the full adaptation notes.
  sonarjs.configs.recommended,
  unicorn.configs.recommended,
  security.configs.recommended,
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'out-tsc/**',
      // Generated OpenAPI client; carries its own `/* eslint-disable */`
      // and is never hand-edited (MIM-209 step 3).
      'src/app/api/generated/**',
      'vitest.config.*',
      'vitest.config.*.timestamp*',
      'playwright.config.ts',
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
    plugins: {
      'unused-imports': unusedImports,
    },
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
      // Type-aware rules ported from example-eslint.config.mjs. These
      // live only in this src/**/*.ts block (which has `projectService`)
      // and are deliberately NOT added to the tests/**/*.ts + e2e/**/*.ts
      // block below: neither tree is included by any tsconfig
      // (tsconfig.app.json / tsconfig.spec.json both include only
      // `src/`), so type-aware parsing would fail there (see the
      // FIX-69 comment on that block).
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
    // FIX-69 widens `lintFilePatterns` (angular.json) to include `tests/**/*.ts`
    // and `e2e/**/*.ts`. Neither tree belongs to a TypeScript project
    // (tsconfig.app.json and tsconfig.spec.json both include only `src/`), so
    // this block gives ESLint the non-type-aware presets rather than the
    // type-aware `extends` above — without a matching block at all, ESLint
    // reports "File ignored because no matching configuration was supplied"
    // for every file in these two trees and the widening buys nothing. FIX-46
    // (blocked, pending FIX-39) would add a second, later block matching these
    // same two trees plus `src/**/*.spec.ts` that carries the
    // `no-restricted-syntax` test-policy rule; no such block exists in this
    // file today, so MIM-209 keeps none and adds none.
    files: ['tests/**/*.ts', 'e2e/**/*.ts'],
    extends: [eslint.configs.recommended, tseslint.configs.recommended],
  },
  {
    // Non-type-aware baseline ported from example-eslint.config.mjs's broad
    // `files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx']` block, scoped
    // to this app's three TypeScript trees (there are no .tsx/.js/.jsx
    // source files here). The Nx-only `@nx/enforce-module-boundaries` rule
    // from that block is dropped entirely: this is not an Nx workspace.
    files: ['src/**/*.ts', 'tests/**/*.ts', 'e2e/**/*.ts'],
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
      '@typescript-eslint/prefer-for-of': 'warn',
      'arrow-body-style': ['error', 'as-needed'],
      'object-shorthand': 'error',
      '@typescript-eslint/adjacent-overload-signatures': 'error',
      '@typescript-eslint/class-literal-property-style': ['error', 'fields'],
      'no-promise-executor-return': ['error'],
      'no-unmodified-loop-condition': ['error'],
      curly: ['error'],
      'default-param-last': ['warn'],
      eqeqeq: ['error', 'always'],
      'no-invalid-this': ['error'],
      'no-iterator': ['error'],
      'max-lines': [
        'error',
        {
          max: 500,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      'no-magic-numbers': [
        'error',
        {
          detectObjects: false,
          enforceConst: true,
          ignore: [0, 1, -1, 2],
          ignoreArrayIndexes: true,
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "PropertyDefinition[accessibility='private']",
          message:
            "Use native ECMAScript private fields (e.g., #field) instead of the TypeScript 'private' modifier.",
        },
        {
          selector: "MethodDefinition[accessibility='private']",
          message:
            "Use native ECMAScript private methods (e.g., #method) instead of the TypeScript 'private' modifier.",
        },
        {
          selector: "TSParameterProperty[accessibility='private']",
          message:
            "Do not use 'private' in constructor parameter properties. Define a native private field (#field) and assign the value manually.",
        },
      ],
      'max-lines-per-function': ['error', { max: 100, skipBlankLines: true, skipComments: true }],
      'no-void': ['error'],
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
          selector: 'typeParameter',
          format: ['UPPER_CASE'],
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
      'unicorn/no-non-function-verb-prefix': [
        'error',
        { verbs: ['get', 'set', 'unset', 'delete', 'add', 'remove', 'create'] },
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
      // Prefer flatMap over map().flat()
      'unicorn/prefer-array-flat-map': 'error',
      // No useless array spread
      'unicorn/no-useless-spread': 'error',
      'unicorn/consistent-function-scoping': 'off',
      'unicorn/require-module-specifiers': 'off',
      'unicorn/no-useless-undefined': 'off',
      'unicorn/no-null': 'off',
      'unicorn/number-literal-case': 'off',
      'unicorn/name-replacements': [
        'error',
        {
          ignore: [/\.e2e\./],
        },
      ],
      // Enforce minimum identifier length to prevent opaque abbreviations (e.g. ff, ds, ng).
      'id-length': [
        'warn',
        {
          min: 3,
          exceptions: [
            'x',
            'y',
            'z', // coordinates
            'i',
            'j',
            'k', // loop indices
            'id', // universal identifier field
            'of',
            'to',
            'up',
            'ok', // English prepositions / status
            'db',
            'fn',
            'el', // established tech abbreviations
            't',
            'e',
            'a',
            'b',
            'c',
            'd',
            'v',
            's', // single-char conventionals
          ],
          properties: 'never',
        },
      ],
    },
  },
  {
    files: ['**/*.spec.ts'],
    rules: {
      // Allow longer functions in test files
      'max-lines-per-function': ['error', { max: 150, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // Scoped to src/**/*.html (not the source repo's unscoped `**/*.html`):
    // this app's docs/ tree carries several MB of static yettel.hu
    // reference captures and a docs/index.html, none of them Angular
    // templates, and a repo-wide glob sent the Angular template parser
    // into a multi-minute stall on docs/index.html (654 KB) during the
    // MIM-209 inventory run.
    files: ['src/**/*.html'],
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
      // Disable SonarJS rules that don't work with Angular templates
      // (including the processed output of `angular.processInlineTemplates`
      // on component `template: \`...\`` strings).
      'sonarjs/no-unenclosed-multiline-block': 'off',
      'sonarjs/no-same-line-conditional': 'off',
      'sonarjs/no-element-overwrite': 'off',
      // code-eval (S1523) crashes on Angular HTML templates with a TypeError
      // ("Cannot read properties of undefined (reading '0')"). Known plugin bug,
      // not fixable by upgrade. Rule is JS-context only, irrelevant in templates.
      'sonarjs/code-eval': 'off',
      // Disable Unicorn rules that don't work with Angular templates
      'unicorn/no-empty-file': 'off',
      'unicorn/template-indent': 'off',
      'unicorn/prefer-string-raw': 'off',
      'unicorn/no-null': 'off',
      // no-useless-template-literals crashes on Angular HTML templates with the same
      // "Cannot read properties of undefined (reading '0')" TypeError as the sonarjs rule above.
      'unicorn/no-useless-template-literals': 'off',
      // Found during MIM-209's own inventory run (not present in the source
      // repo's disable list): this rule reports nothing against these
      // templates in a plain lint pass, but its --fix-dry-run fixer crashes
      // with the identical "Cannot read properties of undefined (reading
      // '0')" TypeError on an Angular property binding that concatenates a
      // string literal (e.g. `[attr.aria-label]="'Törlés: ' + line().name"`
      // in src/app/features/cart/cart-line.html:52). Same plugin-bug class
      // as the two rules above; off for the same reason.
      'unicorn/no-incorrect-template-string-interpolation': 'off',
    },
  },
  eslintConfigPrettier,
]);
