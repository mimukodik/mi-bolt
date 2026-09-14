# 07 — Format and Official Sources

Review date: **September 13, 2026.** This is not a forecast for the entire second half of 2026. The specific MiBolt branding rules are project decisions; the sources support skill packaging and accessibility foundations, not the fictional brand's prices or services.

## S1 — Agent Skills Specification

[Official format](https://agentskills.io/specification)

A folder containing `SKILL.md`, YAML frontmatter and the required `name` and `description` fields. The name is at most 64 characters, uses lowercase letters, numbers and hyphens, and matches the folder name. The description is at most 1024 characters. Details may be organized under `references`, `assets` and optional `scripts`. The description supports skill selection; the main text enters context on activation, and detailed supporting material is loaded as needed. The recommended main file remains below 500 lines. This package uses the simple, portable foundation without runtime-specific tool permissions.

## S2 — Claude Code

[Official skills documentation](https://code.claude.com/docs/en/skills)

Project installation: `.claude/skills/mi-bolt-design/SKILL.md`. User installation: `~/.claude/skills/mi-bolt-design/SKILL.md`. Explicit invocation: `/mi-bolt-design`. Copy the entire folder with its supporting files. Description-based activation may also occur, but it must be tested in the specific environment.

## S3 — OpenAI / Codex

[Official skills documentation](https://developers.openai.com/codex/skills)

At the time of review, the document redirected to the ChatGPT Learn “Build skills” page. Codex project directory: `.agents/skills/mi-bolt-design/`; user directory: `~/.agents/skills/mi-bolt-design/`. Explicit reference: `$mi-bolt-design`. Verify native discovery and loading of referenced images in the installed client. Other clients, such as agy/Antigravity, require documentation for their specific installed versions; this package does not claim a tested integration.

## S4 — W3C: Text Contrast

[WCAG 2.2 — Understanding 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

Contrast thresholds for normal and large text, size-dependent exceptions and interpretation of the calculation. Correcting MiBolt's small-white-text/bright-orange combination is a related project decision, checked using the package's own calculation.

## S5 — W3C: Non-Text Contrast

[WCAG 2.2 — Understanding 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)

Contrast of control and state indicators required for understanding. A decorative border is not automatically equivalent to an outline needed to operate an input.

## S6 — W3C: Target Size

[WCAG 2.2 — Understanding 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)

The 24×24 CSS px minimum and its exceptions. This package's 44×44 shopping target area is a stricter project-specific design requirement.

## S7 — W3C: Modal Pattern

[ARIA Authoring Practices — Dialog (Modal)](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)

The official pattern for modal focus management, keyboard behavior and programmatic semantics. The skill provides guidance; the actual widget must still be tested.

## S8 — Design Tokens Community Group

[Design Tokens Format Module 2025.10](https://www.designtokens.org/tr/2025.10/format/)

`assets/tokens.json` uses a supported subset of the 2025.10 format: `$type`, `$value`, groups, semantic references, sRGB color objects and dimensions. It is not a complete DTCG implementation and provides neither a runtime theme resolver nor full schema certification. The CSS is a companion file generated from the package's tokens, not a second, independent source of truth.

## What These Sources Do Not Establish

They do not prove projected late-2026 design trends, automatic LLM rule adherence, a partner's commercial offers, pixel-perfect CSS recovered from the original raster image or a completed browser implementation. The correctness of the skill structure and the quality of the webshop produced from it require separate evaluation.
