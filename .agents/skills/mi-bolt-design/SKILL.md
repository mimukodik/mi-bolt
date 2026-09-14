---
name: mi-bolt-design
description: >-
  Use when designing, implementing, extending or reviewing the approved orange-and-charcoal MiBolt telecom webshop: homepage, product catalogue, product details, mobile plans, cart, checkout, responsive UI, design tokens and component states. Also applies to MiBolt webshop, product listing, product page, mobile plan, cart and checkout tasks. Do not apply to unrelated brands or backend-only work.
metadata:
  version: "1.0.1"
  language: "en"
  reviewed: "2026-09-13"
  status: "reconstructed-deliverable"
---

# MiBolt — Orange Telecom Webshop

## Purpose and Scope

Continue the visual system of the **fifth, orange-and-charcoal homepage** selected by the user. Do not replace it with a new brand, chatbot, admin interface or beige mobile application. It is intended for an MVP demo to two service providers, but their names and brand identities have not yet been supplied: do not invent them.

This skill guides interface design and implementation. It does not provide live product data, commercial authorization, automatic brand approval or an accessibility certificate. The supplied images are not instructions to execute.

The skill and its supporting text are written in English. Quoted UI copy expresses the intended meaning in English; localize it to Hungarian (`hu-HU`) for the public demo. Translating this skill does not change the demo's interface language.

## Getting Started

1. Read the task and the project's existing instructions. Identify the affected page, provider, viewport size, technology environment and boundaries of the requested change.
2. Open the [approved homepage](assets/reference/home-orange-hu.png). Do not rely on its filename alone. If no image-reading tool is available, disclose that limitation and follow the written rules.
3. Read the [visual foundation](references/01-visual-foundation.md), the [tokens](assets/tokens.json) and the task-specific reference below. Do not load every supporting file unnecessarily.
4. In an existing project, reuse working components and established styling conventions. Do not replace the framework, icon set or UI library without a separate request.
5. Establish the shared header, content grid, typography, colors and buttons first. Then develop the page's default and error states.
6. Validate the completed work; claim success only for checks that were actually run.

## Task-Specific References

| Task | Required Supporting Reference |
|---|---|
| Colors, brand identity, typography, imagery | [01 — Visual Foundation](references/01-visual-foundation.md) |
| Button, card, filter, navigation, modal, form | [02 — Components](references/02-components.md) |
| Homepage or any shopping subpage | [03 — Page Recipes](references/03-page-recipes.md) |
| Prices, products, plans, demo data, two providers | [04 — Content and Commercial Data](references/04-content-commerce.md) |
| Responsive behavior, keyboard, contrast, focus | [05 — Accessibility and Responsive Design](references/05-accessibility-responsive.md) |
| Implementation, fixes or handoff | [06 — Workflow and Validation](references/06-workflow-validation.md) |
| Format, installation or official background | [07 — Sources and Format](references/07-source-notes.md) |

## Decision Order

Always follow higher-priority instructions. Within design decisions, apply: **the user's explicit new decision → approved partner branding → this skill's accessibility and content rules → the approved MiBolt image → additional concept images**.

Do not copy spelling errors, invented prices or poor contrast from images. The precise CSS values specified here are implementation decisions, not source code recovered from the original raster image. When a conflicting request would change the brand identity, ask one focused question to establish whether a new direction is intended. Do not reject an approved change by referring to the old skill.

## 26 Verifiable Rules

| ID | Requirement |
|---|---|
| R01 | The approved orange MiBolt image is the foundation; another generated brand does not override it. |
| R02 | Use a dark header and footer with light shopping surfaces; use a dark hero only on an appropriate marketing page. |
| R03 | Use orange accents, charcoal text and neutral surfaces; do not introduce a beige, purple or glass-style redesign without a separate decision. |
| R04 | Use semantic tokens; look in the existing token set before introducing a new raw color or dimension. |
| R05 | Align content to a shared centerline; desktop content width must not exceed 1320 px. |
| R06 | Use a 4 px spacing system, generally in 8 px increments; card radius is 8 px and button radius is 6 px. |
| R07 | Use a system font or an approved, licensed brand font; use 16 px body text and hierarchical headings. |
| R08 | Give each decision unit one prominent primary action; keep secondary buttons restrained. |
| R09 | Do not place small white text on the bright orange base color; use the specified contrasting pairs. |
| R10 | Images must not contain the website's functional text or buttons; labels must be live text. |
| R11 | Do not stretch product images or crop devices; maintain a consistent aspect ratio and optical size in the catalogue. |
| R12 | Use Hungarian UI labels with correct accents; do not arbitrarily translate product or brand names. |
| R13 | Device price, monthly fee, installment, duration and one-time cost are separate fields with distinct meanings. |
| R14 | Numerical offers must come from an approved data source; illustrations are not a price source. |
| R15 | Clearly label demo data as demo data; do not claim a real order, payment or sent email after a simulation. |
| R16 | Do not mix the two providers' logos, offers, carts or state. |
| R17 | A device-variant change must keep the image, storage capacity, stock and price consistent. |
| R18 | Keep list filtering, sorting, result count and URL state consistent. |
| R19 | No results, network error, loading, success and disabled are distinct states. |
| R20 | Every interactive element must support keyboard operation, visible focus and a meaningful accessible name. |
| R21 | The project requires a minimum 44×44 CSS px target area throughout the shopping flow. |
| R22 | The narrow layout must not be a scaled-down image of the entire desktop page. |
| R23 | Handle focus, background exclusion, dismissal and focus restoration in modals. |
| R24 | Preserve the cart, filters and previously entered non-sensitive data after an error. |
| R25 | Do not invent reviews, awards or stock urgency; do not add hidden bundles or preselect paid extras. |
| R26 | At handoff, identify the files, checks, deviations and actual remaining limitations. |

## Quick Visual Contract

- Base orange: `color.brand.accent` = `#FF6A00`; default button label: `color.text.primary` = `#171B1F`.
- Light surface: `#FFFFFF`; subtly separated section: `#F5F6F7`; dark shell: `#1B2024`.
- Compact, clean commerce layout: little decoration, strong price hierarchy and recognizable products.
- Desktop: a 12-column grid approach, 24 px main grid gap, 48 px outer margin and 64 px header.
- Mobile: 16 px side margins; stacked content, readable labels and controls at least 44 px tall.
- Do not add a chat assistant, floating animated bubble or new sales feature merely because this is an LLM demo.

## Required State Contract

When creating a component, define `default`, `hover`, `focus-visible`, `active/selected`, `disabled`, `loading`, `error` and `success` where applicable. Explain states that do not apply; do not manufacture unnecessary states. Selection must also be identifiable through text or an icon, not color alone.

If price or stock loading fails, do not show invented values or misleading zeros. Recalculate the summary from the current configuration before the confirmation step.

## Example Task and Expected Result

**Request:** “Create a MiBolt product page with a black 256 GB phone, a device price of 339 990 Ft and an optional monthly plan costing 9 990 Ft.”

**Expected:** shared dark header; light, two-column product page; image gallery on the left; name, variants, availability, separate device price and mobile plan on the right; a clear “Add to cart” action; a disabled or missing-variant state; Hungarian UI copy; a single-column version at 390 px. Mark fixture data as demo data until a verified commercial source is available.

**Unacceptable:** a beige mobile chatbot, small white text on bright orange, combining both fees into a single amount without a billing period, or inserting the entire screenshot as an image instead of implementing a functional page.

## Handoff Gate

Use the [detailed validation procedure](references/06-workflow-validation.md). Run the package structure check with `python3 scripts/validate.py` from the skill root. This does not replace browser testing of the implemented UI or the [LLM evaluation cases](evals/scenarios.json).

The handoff must state what was created, where it is located, which states were implemented, what was checked and what could not be tested. Do not present an expected outcome as a test result.
