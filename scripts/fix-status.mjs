#!/usr/bin/env node
// scripts/fix-status.mjs — the docs/fix ledger gate.
//
// Every docs/fix/FIX-*.md file carries a `Status:` line that is
// supposed to say whether its task has been executed. Nobody wrote
// those lines back as the work landed: measured 2026-09-19, 73 of the
// 74 files still read "Status: PLANNED — not executed." while 51 of
// them had at least one commit naming them, and one session was routed
// off a stale PLANNED line into re-executing a task that was already
// finished.
//
// A prose rule had already failed at this, which is why the answer is a
// script. It derives the state instead of trusting the line, so nobody
// has to take a session's word for where the run stands.
//
// What it checks, per document:
//   1. Status vs history, at two grades of evidence. A `Task: FIX-xx`
//      trailer is a commit claiming that task as its own, so a document
//      claiming PLANNED against one is a DRIFT row and fails the gate.
//      A bare mention anywhere in a subject or body is weaker: it is
//      also what a commit looks like when it creates the task files, or
//      when its body says the work is owed to a different task. Those
//      become MENTIONED rows, printed for a reader to judge and not
//      failing the gate. A document claiming DONE with neither behind
//      it is UNBACKED.
//   2. Every `path:line` reference resolves — the file exists and has
//      at least that many lines. FIX-06 moved the spec files from
//      tests/ into src/**, so references written before that move point
//      at nothing.
//   3. Every bare path with a file extension exists on disk.
//
// A commit naming an id is evidence that work happened, not proof that
// the task is complete, so a DRIFT row is a prompt to read the document
// and write the truth into it rather than an automatic "done".
//
// **Only DRIFT and UNBACKED fail this gate.** They are the rows the gate
// was written for: a status line the tree contradicts is what sent two
// sessions to re-execute finished work. The other three are printed and
// counted so nothing is lost sight of, and they do not fail, because a
// gate that can never go green stops carrying information — the same
// lesson the 100% per-file coverage threshold taught on 2026-09-20, when
// it had been red on every run for so long that its exit code answered
// nothing. Each has its own reason as well: a task document naming a
// file it intends to create is describing work, not lying; a weak
// MENTIONED match is often a commit that created the task files or one
// whose body hands the work to a different task; and of the DEAD-REF
// rows, many cite an assertion a later rewrite deleted outright, so no
// "moved to" target exists, while others are paths into an installed
// dependency written without their `node_modules/...` prefix, which this
// extractor cannot tell from a repository path.
//
// Exit codes: 0 when every status line agrees with the tree, 1 when a
// DRIFT or UNBACKED row is reported, 2 when an extractor came back empty
// and the run is therefore not trustworthy. `--json` prints every row
// including the non-failing kinds; `--quiet` prints only the counts.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIX_DIR = join(REPO_ROOT, 'docs', 'fix');

/**
Paths a reference may start with. Anything else is prose, not a path.
*/
const PATH_ROOTS = ['src/', 'tests/', 'e2e/', 'scripts/', 'docs/', '.claude/', 'packages/'];

/**
 * The alternation `PATH_ROOTS` contributes to a pattern, with `.`
 * escaped and the whole thing wrapped in a non-capturing group.
 *
 * The group is the load-bearing part. Without it the trailing
 * `[A-Za-z0-9/._-]+` binds only to the last alternative, so the pattern
 * reads "a bare `src/`, or a bare `tests/`, ... or a `packages/` path",
 * and a reference like `tests/cart-page.spec.ts:19` matches nothing.
 * An earlier draft shipped exactly that and reported zero dead
 * references across all 74 documents while 36 `tests/` paths were in
 * fact gone.
 */
const ROOT_ALTERNATION = `(?:${PATH_ROOTS.map((root) => root.replaceAll('.', String.raw`\.`)).join('|')})`;

/**
The row kinds that fail the gate. The header says why only these two.
*/
const GATING_KINDS = new Set(['DRIFT', 'UNBACKED']);

/**
Extensions that make a bare token a file reference rather than a directory.
*/
const FILE_EXTENSIONS = ['.ts', '.html', '.scss', '.md', '.json', '.mjs', '.mts', '.yaml', '.yml'];

/**
 * One problem found in one document. `kind` is what the reader has to
 * do about it, which is why status drift and a dead path are separate
 * kinds rather than one "error".
 */
class Finding {
  /**
   * @param {string} doc FIX id, e.g. `FIX-07b`.
   * @param {'DRIFT'|'MENTIONED'|'UNBACKED'|'DEAD-REF'|'DEAD-PATH'} kind
   * @param {string} detail One line, specific enough to act on.
   */
  constructor(doc, kind, detail) {
    this.doc = doc;
    this.kind = kind;
    this.detail = detail;
  }
}

/**
 * Commits that claim this FIX id as their own work, by carrying a
 * `Task: FIX-xx` trailer. This is the strong signal, and the only one
 * that fails the gate: a trailer is a commit saying the task is what it
 * did, rather than a body that happens to name it.
 *
 * `--all` is deliberate: work parked on another branch is still work,
 * and calling it absent would be the same lie the Status lines tell.
 */
function commitsClaiming(id) {
  const out = execFileSync('git', ['log', '--all', '--format=%h', '-E', `--grep=^Task: ${id}$`], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return out.split('\n').filter((line) => line.length > 0);
}

/**
 * Commits that name the id anywhere, claiming it or not. Weaker than the
 * trailer above by a margin that was measured rather than guessed: of 49
 * documents this flagged on 2026-09-20, an agent reading every named
 * commit's diff found 26 were not execution at all. Four matched
 * `c02d33c`, the commit that created the 75 task files and names every id
 * in its own filenames; twenty-two matched commits whose body says the
 * work is still owed to a different task.
 */
function commitsNaming(id) {
  // The boundary is spelled out rather than written `\b`: git's regex
  // engine does not implement that escape, and a pattern using it
  // matches nothing at all while still exiting 0. An earlier draft of
  // this script reported 2 drifting documents for exactly that reason,
  // against 50 counted by hand. The trailing group is what keeps
  // `FIX-07` from claiming `FIX-07b`'s commits.
  const out = execFileSync(
    'git',
    ['log', '--all', '--format=%h', '-E', `--grep=${id}([^0-9A-Za-z]|$)`],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );
  return out.split('\n').filter((line) => line.length > 0);
}

/**
The `Status:` line's value, or null when the document has none.
*/
function statusOf(body) {
  const match = /^Status:[ \t]*(.+)$/m.exec(body);
  return match === null ? null : match[1].trim();
}

/**
 * `path:line` and `path:start-end` references. The line number is what
 * separates these from the bare paths below: a reference that names a
 * line is making a claim about the file's contents, so it goes stale
 * when the file is edited rather than only when it is deleted.
 */
function lineReferences(body) {
  const pattern = new RegExp(String.raw`(${ROOT_ALTERNATION}[A-Za-z0-9/._-]+):(\d+)`, 'g');
  const found = new Map();
  for (const match of body.matchAll(pattern)) {
    const [, path, line] = match;
    const previous = found.get(path) ?? 0;
    found.set(path, Math.max(previous, Number(line)));
  }
  return found;
}

/**
Bare paths carrying a file extension, with no line number attached.
*/
function barePaths(body) {
  const pattern = new RegExp(`(${ROOT_ALTERNATION}[A-Za-z0-9/._-]+)`, 'g');
  const found = new Set();
  for (const match of body.matchAll(pattern)) {
    const path = match[1];
    if (FILE_EXTENSIONS.some((extension) => path.endsWith(extension))) found.add(path);
  }
  return found;
}

/**
Line count of a file already known to exist.
*/
function lineCount(path) {
  return readFileSync(join(REPO_ROOT, path), 'utf8').split('\n').length;
}

/**
True when the status text claims the task has not run yet.
*/
function claimsPlanned(status) {
  return /\bPLANNED\b/i.test(status) || /\bnot executed\b/i.test(status);
}

/**
True when the status text claims the task has landed.
*/
function claimsDone(status) {
  return /\b(DONE|LANDED|EXECUTED|COMPLETE)\b/i.test(status) && !claimsPlanned(status);
}

/**
Every finding for one document, in the order a reader should act on them.
*/
function auditDocument(id, body) {
  const findings = [];
  const status = statusOf(body);

  if (status === null) {
    findings.push(new Finding(id, 'DRIFT', 'no Status: line at all'));
  } else {
    const claiming = commitsClaiming(id);
    const naming = commitsNaming(id).filter((sha) => !claiming.includes(sha));
    if (claimsPlanned(status) && claiming.length > 0) {
      findings.push(
        new Finding(
          id,
          'DRIFT',
          `says "${status}" but ${claiming.length} commit(s) claim it by trailer: ${claiming.slice(0, 3).join(', ')}`,
        ),
      );
    } else if (claimsPlanned(status) && naming.length > 0) {
      findings.push(
        new Finding(
          id,
          'MENTIONED',
          `says "${status}"; ${naming.length} commit(s) name it without claiming it: ${naming.slice(0, 3).join(', ')}`,
        ),
      );
    }
    if (claimsDone(status) && claiming.length === 0 && naming.length === 0) {
      findings.push(new Finding(id, 'UNBACKED', `says "${status}" but no commit names it`));
    }
  }

  for (const [path, highestLine] of lineReferences(body)) {
    if (!existsSync(join(REPO_ROOT, path))) {
      findings.push(new Finding(id, 'DEAD-REF', `${path}:${highestLine} — file does not exist`));
      continue;
    }
    const lines = lineCount(path);
    if (highestLine > lines) {
      findings.push(
        new Finding(id, 'DEAD-REF', `${path}:${highestLine} — file has only ${lines} lines`),
      );
    }
  }

  const referencedWithLine = new Set(lineReferences(body).keys());
  for (const path of barePaths(body)) {
    if (referencedWithLine.has(path)) continue;
    if (!existsSync(join(REPO_ROOT, path))) {
      findings.push(new Finding(id, 'DEAD-PATH', `${path} — does not exist`));
    }
  }

  return findings;
}

function main() {
  const asJson = process.argv.includes('--json');
  const quiet = process.argv.includes('--quiet');

  const files = readdirSync(FIX_DIR)
    .filter((name) => /^FIX-.+\.md$/.test(name))
    .sort();

  const findings = [];
  let referencesSeen = 0;
  let commitsSeen = 0;
  for (const name of files) {
    const id = name.replace(/\.md$/, '');
    const body = readFileSync(join(FIX_DIR, name), 'utf8');
    referencesSeen += lineReferences(body).size + barePaths(body).size;
    commitsSeen += commitsNaming(id).length + commitsClaiming(id).length;
    findings.push(...auditDocument(id, body));
  }

  // Both extractors have silently returned nothing before, each from a
  // regex that was wrong rather than from a repository that was clean:
  // `--grep=<id>\\b` matched no commit because git's engine has no `\\b`,
  // and an ungrouped alternation left the path pattern matching no
  // reference. Either failure exits 0 with reassuring counts, which is
  // worse than no gate at all. A run that finds nothing to extract is a
  // broken run, and it says so instead.
  if (referencesSeen === 0) {
    process.stderr.write('fix-status: extracted 0 path references from 74 documents.\n');
    process.stderr.write('The reference pattern is broken; this is not a clean result.\n');
    process.exit(2);
  }
  if (commitsSeen === 0) {
    process.stderr.write('fix-status: no commit matched any FIX id.\n');
    process.stderr.write('The --grep pattern is broken; this is not a clean result.\n');
    process.exit(2);
  }

  if (asJson) {
    process.stdout.write(`${JSON.stringify(findings, null, 2)}\n`);
    process.exit(findings.some((finding) => GATING_KINDS.has(finding.kind)) ? 1 : 0);
  }

  const byKind = new Map();
  for (const finding of findings) {
    byKind.set(finding.kind, (byKind.get(finding.kind) ?? 0) + 1);
  }
  const documentsWithFindings = new Set(findings.map((finding) => finding.doc)).size;

  if (!quiet) {
    let currentDocument = '';
    for (const finding of findings) {
      if (finding.doc !== currentDocument) {
        currentDocument = finding.doc;
        process.stdout.write(`\n${currentDocument}\n`);
      }
      process.stdout.write(`  ${finding.kind.padEnd(10)} ${finding.detail}\n`);
    }
    process.stdout.write('\n');
  }

  process.stdout.write(`documents:        ${files.length}\n`);
  process.stdout.write(`with findings:    ${documentsWithFindings}\n`);
  process.stdout.write(`clean:            ${files.length - documentsWithFindings}\n`);
  for (const [kind, count] of [...byKind].sort()) {
    process.stdout.write(`${`${kind}:`.padEnd(18)}${count}\n`);
  }

  const gating = findings.filter((finding) => GATING_KINDS.has(finding.kind));
  process.exit(gating.length === 0 ? 0 : 1);
}

main();
