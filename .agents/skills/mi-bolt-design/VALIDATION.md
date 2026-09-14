# Validation Report — MiBolt 1.0.1

Date: September 13, 2026. This report belongs to the current release, not the previously referenced unavailable package.

## Checks Actually Performed

Result of running `python3 scripts/validate.py`: **11/11 package-level checks passed**.

The main SKILL.md contains **107 lines**, and its frontmatter description contains **396 characters**. In addition to the package's narrow frontmatter check, the YAML frontmatter was independently parsed using PyYAML; all metadata values are strings.

The validated package contains **26 rules**, **75 tokens**, **2 PNG references** and **18 LLM evaluation cases**. Token values, aliases and parity with the CSS variables were checked.

All **13 specified positive color pairs** met their respective contrast thresholds. Negative control: white text on a `#FF6A00` background has a ratio of **2.8714:1**, which does not meet 4.5:1 for normal text. The package's default button label is dark.

The SHA-256 values of both reference files match the manifest generated from the source. The approved homepage has not been redrawn or recompressed.

The validator was checked on separate copies with four deliberate faults: a missing SKILL.md, a broken local link, a modified image and CSS that differs from the tokens. All four produced the appropriate failure and a nonzero exit code. These are controls for the package validator, not browser or LLM tests.

Machine-readable results: `evals/package-validation.json` and `evals/validator-controls.json`.

## English Translation Checks

The skill, supporting documentation, examples, evaluation prompts and image descriptions are in English. `README.hu.md` and `VALIDATION.hu.md` were renamed to `README.md` and `VALIDATION.md`; their references and the validator's translated content check were updated accordingly. The skill's documentation-language metadata is `en`.

The two PNG files, token JSON and token CSS are byte-for-byte identical to the original 1.0.1 package. The original source filename remains an unchanged provenance identifier in the image manifest. The 26 rule identifiers, seven page recipes, 18 evaluation-case identifiers, source URLs and public demo's `hu-HU` language requirement are preserved. English UI examples express the meaning to localize; they do not change the storefront language.

## Checks Not Performed

No Claude/Codex/agy behavior or activation evaluation was run. The 18 cases are prescribed test scenarios, not 18 successful agent runs.

This corrective release did not produce a working webshop, six additional rendered subpages or a standalone HTML gallery. No Playwright/browser UI tests were run. The remaining shopping pages are specified in text.

No full WCAG audit, legal review, brand authorization or verification of the offers shown in images was performed. Token-format validation covers the package's supported subset, not general DTCG certification.

## Rerunning Validation

From the skill folder: `python3 scripts/validate.py`. The process is read-only, makes no network requests and does not require a YAML library to be installed. The separate PyYAML check described above was an additional check used while assembling the package.
