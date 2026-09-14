# 06 — Workflow and Validation

## Applying the Skill

**Capture the input:** affected page, approved image, partner, language, dataset, viewport size, technology environment and requested result. Use the skill's defaults for missing but non-blocking details. Ask a focused question for a genuine brand or business conflict.

**Design:** begin with the shared page structure and component hierarchy. Then define the main state, followed by loading, empty, error, disabled and success variants. One change must not alter the style or behavior of unrelated pages.

**Implementation:** use the existing framework, tokens and shared components. Introduce a new raw CSS value only as a justified, documented exception. Do not scatter commercial data through JSX/HTML text; use a central data model or fixture. A screenshot is a visual reference, not the page's full background image.

**Visual comparison:** inspect the original image and rendered page at the same width. Compare macro layout first, then typography, image handling, colors, shapes and states. Matching text does not replace visual inspection.

## Pre-Handoff UI Checklist

- [ ] R01–R07: correct brand, shared shell, tokens, grid, typography and corner radii.
- [ ] R08–R11: clear CTA, contrast, live text, correct product image and aspect ratio.
- [ ] R12–R16: Hungarian UI labels, correct pricing arrangement, verified or clearly marked demo data, partner isolation.
- [ ] R17–R19: consistent configuration, result count, filtering and all relevant states.
- [ ] R20–R24: keyboard, focus, target area, responsive behavior, modal handling and data preservation.
- [ ] R25: no invented reviews, stock scarcity or hidden extras.
- [ ] R26: working files and precisely identified checks that were actually run.

Minimum shopping path: homepage → catalogue → filtering → product variant → plan → cart → data entry → demo result. Test only the steps included in the implemented scope; do not mark the others as successful.

## Numerical and State Examples

For a one-time device price of 339 990 Ft and a monthly plan costing 9 990 Ft, display two separate summaries. Two identical devices at the one-time price cost 679 980 Ft; the business model determines the associated number of subscriptions. Do not guess and multiply that number automatically.

Do not silently replace a variant when it is out of stock. A late response from an older filter request must not overwrite the current list after a new filter change. A failed coupon must not remove cart items. A network error is not equivalent to zero results.

## Technical Package Validation

Run from the skill root:

```sh
python3 scripts/validate.py
```

The standard-library validator checks the supported narrow frontmatter format, required files, local links, token values and CSS parity, image SHA-256 values, selected contrast pairs, rule identifiers and evaluation-case identifiers. It is not a general YAML, DTCG or Agent Skills certification tool. The official validator may be run separately as described in the source documentation.

## Evaluating LLM Rule Adherence

`evals/scenarios.json` contains 18 predefined cases covering activation, non-activation, brand conflicts, price sources, contrast, partner isolation, variants, error states, mobile layouts and a control against false test claims.

Method: run the same task and project fixture in fresh-context agents first without the skill, then with it. Record the model, version, tools and run settings. Examine the expected behavior across multiple repetitions. Score the actual generated files and screens, not merely the agent's written self-assessment.

No such live LLM comparison was run when the package was prepared. The JSON describes expected outputs, not measured successes. Static file validation cannot replace this evaluation.

## Handoff Format

Give the user a brief handoff: file link, affected pages/components, relevant validation result and missing evidence. Do not substitute lengthy self-justification for the design. Label an unimplemented subpage as “specified”, not “rendered” or “complete”.
