#!/usr/bin/env node
// verify-skill-evidence.mjs — load the resolved mi-bolt-design skill
// declared in docs/mi-bolt/execution/skill-location.json, recompute the
// SHA-256 of SKILL.md, parse the YAML frontmatter and assert the
// metadata.version matches the approvedVersion, and verify the
// references/ directory contains every required reference file.
//
// Exits 0 with a `skill:OK` summary when every check passes, exits 1
// with a structured error payload otherwise.

import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

export const REQUIRED_REFERENCES = Object.freeze([
  '01-visual-foundation.md',
  '02-components.md',
  '03-page-recipes.md',
  '04-content-commerce.md',
  '05-accessibility-responsive.md',
  '06-workflow-validation.md',
  '07-source-notes.md',
]);

export function parseFrontmatter(content) {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== '---') return null;
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) return null;
  return lines.slice(1, end).join('\n');
}

// The skill frontmatter is a small YAML block; only `metadata.version`
// is required, so a dedicated parser keeps the dependency surface empty.
// Indent must be exactly two spaces to be picked up as a child of
// `metadata:`.
export function parseMetadataVersion(frontmatter) {
  if (typeof frontmatter !== 'string') return null;
  const lines = frontmatter.split(/\r?\n/);
  let inMetadata = false;
  for (const line of lines) {
    if (!inMetadata) {
      if (/^metadata:\s*$/.test(line)) inMetadata = true;
      continue;
    }
    // A sibling key at column 0 closes the metadata block.
    if (/^[^\s]/.test(line)) return null;
    const m =
      line.match(/^\s{2}version:\s*"([^"]+)"\s*$/) ??
      line.match(/^\s{2}version:\s*'([^']+)'\s*$/) ??
      line.match(/^\s{2}version:\s*([A-Za-z0-9_.\-+]+)\s*$/);
    if (m) return m[1];
  }
  return null;
}

export async function validateSkillEvidence(options = {}) {
  const skillLocationPath =
    options.skillLocationPath ??
    resolve(REPO_ROOT, 'docs/mi-bolt/execution/skill-location.json');

  const errors = [];

  let location;
  try {
    const raw = await readFile(skillLocationPath, 'utf8');
    location = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      summary: 'skill:FAIL',
      errors: [
        {
          kind: 'skill-location-unreadable',
          path: skillLocationPath,
          reason: err.message,
        },
      ],
    };
  }

  const skillEntry = options.skillEntryOverride ?? location.entry;
  const skillRoot = options.skillRootOverride ?? location.root;
  const declaredSha =
    options.skillSha256Override ?? location.sha256?.['SKILL.md'];
  const approvedVersion = options.approvedVersion ?? location.approvedVersion;

  let skillContent;
  try {
    skillContent = await readFile(skillEntry, 'utf8');
  } catch (err) {
    errors.push({
      kind: 'skill-entry-unreadable',
      path: skillEntry,
      reason: err.message,
    });
    return { ok: false, summary: 'skill:FAIL', errors };
  }

  const computed = createHash('sha256').update(skillContent).digest('hex');
  if (declaredSha && computed !== declaredSha) {
    errors.push({
      kind: 'sha256-mismatch',
      declared: declaredSha,
      computed,
      reason: 'SKILL.md SHA-256 does not match declared value',
    });
  }

  const frontmatter = parseFrontmatter(skillContent);
  if (!frontmatter) {
    errors.push({
      kind: 'frontmatter-missing',
      reason: 'SKILL.md does not start with --- frontmatter',
    });
  } else {
    const version = parseMetadataVersion(frontmatter);
    if (!version) {
      errors.push({
        kind: 'version-missing',
        reason: 'metadata.version not found in frontmatter',
      });
    } else if (approvedVersion && version !== approvedVersion) {
      errors.push({
        kind: 'version-mismatch',
        declared: approvedVersion,
        found: version,
        reason: `metadata.version "${version}" does not match approvedVersion "${approvedVersion}"`,
      });
    }
  }

  const refsDir = resolve(skillRoot, 'references');
  let refsDirStat = null;
  try {
    refsDirStat = await stat(refsDir);
  } catch {
    errors.push({
      kind: 'references-missing',
      path: refsDir,
      reason: 'references directory does not exist',
    });
  }
  if (refsDirStat?.isDirectory()) {
    for (const ref of REQUIRED_REFERENCES) {
      const refPath = resolve(refsDir, ref);
      try {
        await stat(refPath);
      } catch {
        errors.push({
          kind: 'reference-file-missing',
          path: refPath,
          file: ref,
          reason: `required reference file "${ref}" is missing`,
        });
      }
    }
  }

  const ok = errors.length === 0;
  return {
    ok,
    summary: ok ? 'skill:OK' : 'skill:FAIL',
    computedSha256: computed,
    errors,
  };
}

async function main() {
  const skillLocationPath =
    process.argv[2] ?? resolve(REPO_ROOT, 'docs/mi-bolt/execution/skill-location.json');
  try {
    const result = await validateSkillEvidence({ skillLocationPath });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.ok ? 0 : 1);
  } catch (err) {
    process.stderr.write(String(err.stack ?? err) + '\n');
    process.exit(2);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}