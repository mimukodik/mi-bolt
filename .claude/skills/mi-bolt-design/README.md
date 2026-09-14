# MiBolt Design Skill — Usage

**Version:** 1.0.1 · **Date:** September 13, 2026.

This is the actual, reconstructed skill package for the selected orange-and-charcoal MiBolt design. The ZIP, HTML gallery, additional rendered subpages and test reports referenced in an earlier response were not available in the working directory. This release is not a byte-for-byte restoration of those artifacts and does not inherit their unverifiable test claims.

## What Is Included?

- `SKILL.md`: the LLM entry point, task-specific loading and 26 verifiable rules.
- `references/`: detailed visual, component, page, content and accessibility rules, a validation procedure and official sources.
- `assets/tokens.json` and `assets/tokens.css`: machine-readable tokens and their corresponding CSS variables.
- `assets/reference/`: the original approved Hungarian homepage and a previously generated catalogue concept; a hash manifest for checking provenance.
- `evals/scenarios.json`: 18 LLM evaluation cases, not measured results.
- `scripts/validate.py`: a local package validator that uses only the Python standard library.
- `VALIDATION.md`: the actual checks and limitations for this release.

Detailed written specifications are provided for the subpages. This release does not include six newly rendered subpages, an interactive webshop or the previously mentioned standalone gallery. The off-direction ShopMate/ShopGuide/MobilShop image series is not included.

## Installing for Claude Code

Place the entire folder at this location relative to the project root:

```text
.claude/skills/mi-bolt-design/SKILL.md
```

Keep `references`, `assets`, `scripts` and `evals` in their existing arrangement inside the folder. User-level installation location: `~/.claude/skills/mi-bolt-design/`. Official documentation: [Claude Code skills](https://code.claude.com/docs/en/skills).

Explicit invocation:

```text
/mi-bolt-design Create a product page using the approved orange branding. Keep the interface in Hungarian and display the device price and monthly fee separately.
```

## Installing for Codex

Place the entire folder at this project location:

```text
.agents/skills/mi-bolt-design/SKILL.md
```

User-level installation location: `~/.agents/skills/mi-bolt-design/`. Official documentation: [Codex skills](https://developers.openai.com/codex/skills).

Explicit invocation:

```text
$mi-bolt-design Create a product page using the approved orange branding. Do not design a new brand.
```

For another agent, follow that client's current skill-discovery rules. This package does not claim an unverified agy/Antigravity integration. For manual use, provide the entire folder or include the supporting files, not just the main file.

## Validation

From the skill folder:

```sh
python3 scripts/validate.py
```

The validator makes no network requests, installs no packages and does not modify the project. It checks the complete reference objects but does not run a browser or an LLM. Test the actual interface and agent consistency separately after implementation.

## Core Usage Decisions

Public-facing copy is Hungarian. The sample brand is MiBolt; the two real providers have not been named. Switching to a partner requires approved branding and data. Prices and marketing claims shown in images are not live commercial data. The orange visual reference remains unchanged, but the contrast of small button labels must be corrected in the implementation.

The skill, documentation and evaluation prompts are written in English. UI-copy examples express their intended meaning in English and must be localized to `hu-HU` in the public demo. The `-hu.png` filenames and original source filename in the image manifest remain unchanged to preserve the reference images' language and provenance.
