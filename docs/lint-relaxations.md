# Lint relaxations

The shared eslint baseline (`eslint.config.mjs`), adopted verbatim from the
user's other repository in `89ecae9` ("build: adopt the shared eslint
baseline (MIM-209)"), left 2534 errors and 231 warnings after the autofix
pass on `07a2b2e`. The user decided on 2026-09-20 to relax it for the demo
rather than spend the fix rounds on style-only findings (in English: "if it
is really necessary to go faster we can relax the lint rules, but then let
us write them down in a file under docs so we know what we took out, I feel
I overdid that lint rule"; then: "switch off unicorn and sonar too ... what
fits, the rest we switch off; keep only what is very important").

| Rule | Before | After | Removed | Reason |
| --- | ---: | ---: | ---: | --- |
| `unicorn/*` | ≈330 | 0 | ≈330 | Style-only: naming, member order, ternary style. Plugin removed from `package.json` because no rule is enabled. |
| `sonarjs/*` | ≈150 | 0 | ≈150 | Style-only: assertion style, complexity score. Plugin removed from `package.json` because no rule is enabled. |
| `no-magic-numbers` | 924 | 0 | 924 | Flags every literal; biggest single rule. |
| `no-restricted-syntax` | 264 | 0 | 264 | Forbade `private`; needs a repo rewrite. |
| `id-length` (warn) | 272 | 0 | 272 | Flags short but conventional identifiers. |
| `security/detect-non-literal-fs-filename` (w) | 51 | 0 | 51 | No untrusted fs paths in this app. |
| `security/detect-object-injection` (warn) | 37 | 0 | 37 | No untrusted bracket access here. |
| `no-void` | 26 | 0 | 26 | Style-only. |
| `max-lines-per-function` | 21 | 0 | 21 | Style-only length cap. |
| `max-lines` | 20 | 0 | 20 | Style-only length cap. |
| **Total (repo)** | **2534e/231w** | **227e/8w** | — | `eslint . --format json`, before/after. |

Per-rule counts are from the pre-relax inventory the user supplied; the two
plugin totals are approximate aggregates (`≈`). Largest `unicorn/*`
contributors: `name-replacements` 48, `consistent-class-member-order` 43,
`prefer-logical-operator-over-ternary` 43, `no-top-level-assignment-in-function`
33, `no-non-function-verb-prefix` 30, `no-array-sort` 22,
`no-unreadable-for-of-expression` 20, `prefer-await` 20, `import-style` 16,
`consistent-boolean-name` 16, `prefer-scoped-selector` 16. Largest
`sonarjs/*` contributors: `prefer-specific-assertions` 125,
`cognitive-complexity` 20.

`eslint-plugin-unicorn` and `eslint-plugin-sonarjs` were dropped from
`package.json` because `eslint.config.mjs` never imports them — every rule
each plugin offers is turned off, so the dependency is unused. The relax
table above still records the rule-count delta the plugins would have
contributed, for the inventory audit trail.

## What stays

- `@typescript-eslint` strict type-checked rules: `strict-boolean-expressions`,
  `explicit-function-return-type`, `consistent-type-imports`, `no-unsafe-*`,
  `prefer-nullish-coalescing`, `no-unnecessary-condition`, `naming-convention`.
- `require-await`, `no-promise-executor-return`, `array-callback-return`,
  `no-unused-private-class-members`.
- All Angular eslint rules (`@angular-eslint/*`) and template rules.
- The other 12 of 14 `security/*` rules from `security.configs.recommended`.

## How to reinstate

Each row above is one entry in `eslint.config.mjs`; `git show
89ecae9:eslint.config.mjs` holds the original text to restore a row from.
