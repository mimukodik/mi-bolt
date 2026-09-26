#!/usr/bin/env node
// check-skill-references.mjs
//
// Purpose: check that every path, line anchor, and command cited inside a
// `mibolt-*` skill (its SKILL.md and its references/*.md files) still
// resolves against the current repository, so a skill does not go stale
// silently as the repo moves.
//
// Command (path relative to the `mibolt-project-map` skill directory; run
// from anywhere in the repository):
//   node scripts/check-skill-references.mjs \
//     [--show-anchors] [--no-mise] [<skill name or directory> ...]
//
// Arguments:
//   <skill name or directory>  Zero or more of: a skill name matching
//                 `^mibolt-[a-z0-9-]+$`, resolved in the skills root (the
//                 directory that holds the MiBolt skills; the parent of
//                 this skill's directory); or a path to a `mibolt-*` skill
//                 directory there, as before. An unknown skill name is a
//                 usage error. With none given, every `mibolt-*` directory
//                 in the skills root is checked.
//   --show-anchors  Also print the current text of every line a `path:N` or
//                 `path:N-M` anchor points at, so a reader can judge whether
//                 the cited content still says what the skill claims. This
//                 is informational only and never affects the exit code.
//   --no-mise     Skip invoking `mise`. Every `mise run <task>` token and every
//                 bare task name is then reported UNVERIFIED instead of being
//                 checked.
//
// What it checks, in SKILL.md and references/*.md:
//   (a) every relative Markdown link resolves from the file's own directory;
//   (b) a backticked token is tried, in order, as: a skill-relative path
//       (its first segment is `scripts`, `references`, `assets` or `agents`,
//       or the token is exactly `SKILL.md`), resolved against the root
//       directory of the skill whose file contains it and never against the
//       repository root; then a skill-name-prefixed path (its first segment
//       matches `mibolt-<name>`), resolved against the skills root, a first
//       segment that matches the pattern but names no directory there
//       reported FAIL, reason "no such skill"; a token resolved either way
//       must exist there, held to the same anchor and fresh-checkout rules
//       below. Otherwise, a token whose first path segment is a top-level
//       entry of `git ls-files`: a token with a colon, no slash and no line
//       anchor, such as `backend:docker`, is a mise task name and must
//       appear in `mise tasks --all --json` as `//:<token>` or
//       `//<area>:<task>`; any other token is a path, whose optional `:N` or
//       `:N-M[,N-M...]` anchor is stripped, and the path must exist on disk
//       and be one a fresh checkout holds (tracked, untracked but not
//       ignored, or a directory above one), so a gitignored output fails
//       whether or not it was built here; with an anchor, the path must be a
//       file (an anchor on a directory is reported FAIL, reason "line anchor
//       on a directory") and every upper line number must not exceed its
//       line count; a token containing `*` is a glob and must
//       match at least one such file or directory. A token whose first
//       segment matches neither a skill-relative segment, a skill name, nor
//       a top-level repository entry is not checked at all;
//   (c) commands, checked wherever they appear: as a backticked inline
//       token, and also as a line inside a fenced code block (``` or ~~~,
//       with or without a language tag). A fenced-block line is first
//       trimmed of leading whitespace and an optional `$ ` prompt, and a
//       command continued with a trailing `\` is joined with the next line
//       before matching; a line matching none of the forms below is
//       ignored, and a line containing `<` (a placeholder) or `*` (a glob)
//       is skipped with no report and no count, the same way check (e)
//       skips a placeholder. The forms: `mise run <task>` against
//       `mise tasks --all --json`; `npm --prefix frontend run <s>` /
//       `npm --prefix tools run <s>` against that package.json's "scripts";
//       `backend/gradlew -p backend :services:commerce:<t>` against a
//       `tasks.register('<t>'` in backend/services/commerce/build.gradle, a
//       `run` line of backend/mise.toml, or a `./gradlew` line of
//       .github/workflows/backend.yml (reported UNVERIFIED when none of the
//       three has it, since Gradle tasks cannot be listed statically, and
//       never reported as a positive pass); and `node [options] <path>` and
//       `uv run ... python [options] <path>`, taking the first word that is
//       not an option, resolved the same way (b) resolves a path token —
//       skill-relative, then skill-name-prefixed, then the repository root
//       as a last resort — and held to the same fresh-checkout test;
//   (d) hygiene: `/Users/`, `/home/`, `~/`, `/tmp/` (also after `/private`
//       or `/var`), `/var/folders/` (also after `/private`) and `file://` are
//       reported as FAIL wherever a path starts with them: at the start of a
//       line, or after whitespace or one of ` ' " ( [ { < > = : ; , |.
//   (e) section names: after collapsing each run of whitespace (newlines
//       included, since a citation can wrap across lines) to one space, find
//       every citation of either shape: `<target>` ("<name>" (backticked
//       target, optional `'s`, a space, `(`, a double-quoted name) or
//       `<target>`, "<name>" (backticked target, a comma, a space, a
//       double-quoted name); only the first quoted name right after the
//       target counts. A backticked `<target>` is read as a citation only
//       when it matches `mibolt-<name>` (a skill name) or is a path, meaning
//       that, with any line anchor stripped as (b) strips it, it contains a
//       `/` or its last segment has a file extension (a dot
//       followed by 1-10 alphanumerics, as in `SKILL.md` or `mise.toml`);
//       any other token followed by a quoted phrase, such as a flag or a
//       bare value, is not a citation and is skipped with no report and no
//       count. `<target>` is resolved, in this order: as a file path
//       (any file, not only `.md`) the way (b) resolves a path token
//       (repo-relative), and when that does not exist, relative to the skill
//       directory (so `SKILL.md` and `references/x.md` resolve inside the
//       skill), and when that does not exist either and the target's first
//       segment matches `mibolt-<name>` and names a directory in the skills
//       root, relative to the skills root; or, when the whole target is a
//       skill name `mibolt-<name>`, as that skill's SKILL.md plus all its
//       references/*.md, concatenated. Four cases:
//       - the target resolves to a directory: reported UNVERIFIED, reason
//         "section target is a directory"; the name is not checked.
//       - the target is a `mibolt-<name>` skill name with no such skill, or
//         a path whose first segment matches `mibolt-<name>` and names no
//         such skill (no directory of that name in the skills root holding
//         a `SKILL.md`): reported FAIL, reason "no such skill".
//       - the target is a path that resolves neither repo-relative nor
//         skill-relative: skipped entirely (no report line, no contribution
//         to "checked") when it holds no whitespace and its first path
//         segment is a top-level entry of `git ls-files` (check (b) already
//         reports that same token) or when
//         the target contains `<` or `*` (a placeholder or a glob, as in a
//         documentation template); otherwise reported FAIL, reason "section
//         target not found".
//       - the target resolves to a file: the check passes when the name,
//         itself already whitespace-collapsed, occurs as a substring of the
//         whitespace-collapsed target text (case-sensitive; headings, bold
//         lead-ins and table cells all count); it fails otherwise, reason
//         `section name not found in <target>`.
//       Every case above except the two silent skips counts toward
//       "checked", whether it reports FAIL, UNVERIFIED, or nothing (a pass).
//   (f) neutral wording: every line of SKILL.md and each references/*.md,
//       fenced code blocks included, is scanned for a harness-specific name
//       or path. This skill's own agents/openai.yaml and its scripts/*.mjs
//       and scripts/*.py are not scanned. Each match is reported FAIL,
//       reason "harness-specific name or path"; on one line, each distinct
//       match is reported once per pattern below. There is no exemption
//       marker and no opt-out flag. The patterns (case-insensitive unless
//       marked; this file's own source spells the first pattern below split
//       across a string concatenation, so it does not itself contain the
//       literal path component it detects):
//         - a dot immediately followed by the six letters of that former
//           hidden-config directory's name, as a path component;
//         - the whole words `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`;
//         - the `.agents/` path component;
//         - the whole words claude, codex, anthropic, openai, gemini,
//           copilot, opus, sonnet, haiku;
//         - the whole words orchestrator, orchestrators, subagent,
//           subagents, sub-agent, sub-agents, spawn, spawns, spawned,
//           spawning;
//         - an agent name matching
//           `\b[a-z]+(-[a-z]+)*-(opus|sonnet|haiku)(-xhigh)?\b` or
//           `\bplaywright-test-[a-z]+\b`;
//         - `mcp__`, the case-sensitive whole word `MCP`, `chrome-devtools`;
//         - the harness tool names AskUserQuestion, TaskCreate, TaskUpdate,
//           SendMessage, TodoWrite, "Skill tool", "Agent tool";
//         - the non-MiBolt skill and tooling names, whole words:
//           model-routing, git-commit, playwright-tests,
//           task-execute-workflow, linear-conventions, memory-review,
//           angular-developer, angular-new-app, skill-creator, coder-agent,
//           agent-memory, retrospective.
//
// Output (to stdout): one line per finding,
//   `FAIL|UNVERIFIED <skill-relative-file>:<line> <kind> <token> — <reason>`
// (for kind `section`, `<token>` is `<target> "<name>"`; for kind `neutral`,
// `<token>` is the matched text), followed by one summary line per skill,
//   `<skill>: <n> checked, <f> FAIL, <u> UNVERIFIED`
// "checked" counts every individual (a)/(b)/(c)/(e) check plus every hygiene
// match and every neutral-wording (f) match found (each match is itself the
// unit of that check, since there is no separate notion of a hygiene or
// neutral-wording check that passed); the two silent-skip cases in (e) count
// toward neither "checked", FAIL nor UNVERIFIED.
//
// Diagnostics and usage/prerequisite errors go to stderr.
//
// Exit codes: 0 no FAIL anywhere; 1 at least one FAIL; 2 a usage or
// prerequisite error, mise missing or failing included unless --no-mise is
// given. Every prerequisite is settled before the first line is printed, so
// nothing is reported in that case.
//
// Prerequisites: git; Node 26 (`mise.toml` pins `node = "26.10.0"`); mise on
// PATH for the `mise run` check, unless `--no-mise` is given.
//
// Read-only guarantee: this script only reads files and runs
// `git rev-parse --show-toplevel`, `git ls-files` (also with
// `--cached --others --exclude-standard`) and `mise tasks --all --json`.
// It makes no writes and no network calls.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

// The skills root is the parent of this skill's own directory, so this
// checker keeps working when the directory that holds the MiBolt skills
// moves.
const SKILLS_ROOT = path.resolve(import.meta.dirname, '..', '..');

// A token's first path segment (split on `/`) that names one of these, or a
// token that is exactly `SKILL.md`, resolves against the skill whose file
// contains it, never against the repository root (check (b) rule 1).
const SKILL_RELATIVE_SEGMENTS = new Set(['scripts', 'references', 'assets', 'agents']);

// A skill name, and a token's first path segment that names one (check (b)
// rule 2 and check (e)'s skill-name-prefixed path fallback).
const SKILL_NAME_RE = /^mibolt-[a-z0-9-]+$/;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseArgs(argv) {
  const options = { showAnchors: false, noMise: false, skillDirs: [] };
  for (const arg of argv) {
    if (arg === '--show-anchors') {
      options.showAnchors = true;
    } else if (arg === '--no-mise') {
      options.noMise = true;
    } else if (arg.startsWith('--')) {
      fail(`unknown option: ${arg}`);
    } else {
      options.skillDirs.push(arg);
    }
  }
  return options;
}

// Every git/mise invocation pipes stdin/stdout/stderr rather than inheriting
// them, so a failing subprocess never leaks its own diagnostic text onto our
// stderr in place of the messages this script defines below.
const QUIET_STDIO = ['ignore', 'pipe', 'pipe'];

function getRepoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: QUIET_STDIO,
    }).trim();
  } catch {
    fail('not inside a git checkout');
  }
}

function getGitLsFiles(repoRoot) {
  const out = execFileSync('git', ['ls-files'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: QUIET_STDIO,
  });
  return out.split('\n').filter(Boolean);
}

let miseTaskNamesCache = null;
function getMiseTaskNames(repoRoot) {
  if (miseTaskNamesCache !== null) return miseTaskNamesCache;
  let out;
  try {
    out = execFileSync('mise', ['tasks', '--all', '--json'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: QUIET_STDIO,
    });
  } catch (error) {
    if (error.code === 'ENOENT') fail('mise not found on PATH; rerun with --no-mise to skip task checks');
    const detail = String(error.stderr ?? '').trim().split('\n')[0];
    fail(`mise tasks --all --json failed${detail ? `: ${detail}` : ''}; rerun with --no-mise to skip task checks`);
  }
  let tasks;
  try {
    tasks = JSON.parse(out);
  } catch {
    fail('mise tasks --all --json printed no JSON; rerun with --no-mise to skip task checks');
  }
  miseTaskNamesCache = new Set(tasks.map((t) => t.name));
  return miseTaskNamesCache;
}

function resolveSkillDirs(positionalArgs) {
  const skillsRoot = SKILLS_ROOT;
  if (positionalArgs.length === 0) {
    return readdirSync(skillsRoot)
      .filter((name) => name.startsWith('mibolt-'))
      .filter((name) => {
        try {
          return statSync(path.join(skillsRoot, name)).isDirectory();
        } catch {
          return false;
        }
      })
      .sort()
      .map((name) => path.join(skillsRoot, name));
  }

  return positionalArgs.map((arg) => {
    if (SKILL_NAME_RE.test(arg)) {
      const resolved = path.join(skillsRoot, arg);
      const looksLikeSkill =
        existsSync(resolved) &&
        statSync(resolved).isDirectory() &&
        existsSync(path.join(resolved, 'SKILL.md'));
      if (!looksLikeSkill) {
        fail(`unknown skill: ${arg}`);
      }
      return resolved;
    }

    const resolved = path.resolve(process.cwd(), arg);
    const rel = path.relative(skillsRoot, resolved);
    const isDirectChild =
      rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel) && !rel.includes(path.sep);
    const basename = path.basename(resolved);
    const looksLikeSkill =
      isDirectChild &&
      basename.startsWith('mibolt-') &&
      existsSync(resolved) &&
      statSync(resolved).isDirectory() &&
      existsSync(path.join(resolved, 'SKILL.md'));
    if (!looksLikeSkill) {
      fail(`not a skill directory: ${arg}`);
    }
    return resolved;
  });
}

function collectSkillFiles(skillDir) {
  const files = [path.join(skillDir, 'SKILL.md')];
  const referencesDir = path.join(skillDir, 'references');
  if (existsSync(referencesDir) && statSync(referencesDir).isDirectory()) {
    for (const name of readdirSync(referencesDir).sort()) {
      if (name.endsWith('.md')) {
        const full = path.join(referencesDir, name);
        if (statSync(full).isFile()) files.push(full);
      }
    }
  }
  return files.filter((f) => existsSync(f));
}

function fileLineCount(absPath) {
  const content = readFileSync(absPath, 'utf8');
  const lines = content.split('\n');
  return content.endsWith('\n') ? lines.length - 1 : lines.length;
}

function globToRegExp(pattern) {
  const escaped = pattern
    .split('*')
    .map((part) => escapeRegExp(part))
    .join('[^/]*');
  // A doubled `*` (i.e. `**`) should cross directory boundaries; undo the
  // per-segment escaping above for that one case.
  const doubled = escaped.replace(/\[\^\/\]\*\[\^\/\]\*/g, '.*');
  return new RegExp(`^${doubled}$`);
}

function checkGlob(token, presentPaths) {
  const re = globToRegExp(token.replace(/\/$/, ''));
  for (const p of presentPaths) if (re.test(p)) return true;
  return false;
}

// Every tracked file, every untracked file no ignore rule covers, and every
// directory above them: what a fresh checkout holds once the author's new files
// are added. A gitignored output (coverage, dist, node_modules, Gradle build/)
// is absent from it on every machine, whether or not it was built here.
function getPresentPaths(repoRoot) {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: QUIET_STDIO,
  });
  const present = new Set();
  for (const file of out.split('\n').filter(Boolean)) {
    const parts = file.split('/');
    for (let i = 1; i <= parts.length; i += 1) present.add(parts.slice(0, i).join('/'));
  }
  return present;
}

const GRADLE_BUILD_PATH = ['backend', 'services', 'commerce', 'build.gradle'];
const GRADLE_MISE_PATH = ['backend', 'mise.toml'];
const GRADLE_WORKFLOW_PATH = ['.github', 'workflows', 'backend.yml'];

function readIfExists(repoRoot, segments) {
  const full = path.join(repoRoot, ...segments);
  return existsSync(full) ? readFileSync(full, 'utf8') : '';
}

function gradleTaskVerified(repoRoot, taskName, cache) {
  if (!cache.loaded) {
    cache.build = readIfExists(repoRoot, GRADLE_BUILD_PATH);
    cache.miseToml = readIfExists(repoRoot, GRADLE_MISE_PATH);
    cache.workflow = readIfExists(repoRoot, GRADLE_WORKFLOW_PATH);
    cache.loaded = true;
  }
  const inBuildGradle = new RegExp(`tasks\\.register\\('${escapeRegExp(taskName)}'`).test(
    cache.build,
  );
  if (inBuildGradle) return true;

  const inMiseToml = new RegExp(`:services:commerce:${escapeRegExp(taskName)}\\b`).test(
    cache.miseToml,
  );
  if (inMiseToml) return true;

  const inWorkflow = cache.workflow.split('\n').some((line) => {
    const trimmed = line.trim();
    if (!trimmed.includes('./gradlew')) return false;
    const tokens = trimmed.split(/\s+/).filter((t) => t && t !== './gradlew' && !t.startsWith('-'));
    return tokens.includes(taskName);
  });
  return inWorkflow;
}

// Splits a backticked token into a base path and an optional `:N` /
// `:N-M[,N-M...]` anchor suffix.
function splitAnchor(token) {
  const m = /^(.+?):(\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*)$/.exec(token);
  if (!m) return { base: token, anchor: null };
  return { base: m[1], anchor: m[2] };
}

function anchorUpperBounds(anchor) {
  return anchor.split(',').map((part) => {
    const [n, m] = part.split('-');
    return Number(m ?? n);
  });
}

// Resolves a backticked path token's base (its `:N`/`:N-M` anchor already
// stripped) against, in order: the skill whose file contains it (rule 1:
// its first path segment is `scripts`, `references`, `assets` or `agents`,
// or the base is exactly `SKILL.md`), or a skill named by its first path
// segment (rule 2: the segment matches `mibolt-<name>`), resolved against
// the skills root. Returns `{ kind: 'none' }` when neither rule's first
// segment matches, so the caller falls back to (b)'s rule 4 (a top-level
// repository entry) or, for a command path, the repository root;
// `{ kind, found: true, resolved }` when the base exists there;
// `{ kind, found: false }` when it does not; or, for rule 2 with a first
// segment that names no skill directory in the skills root,
// `{ kind: 'skill-name-prefixed', found: false, noSuchSkill: true }`.
function resolvePathBase(base, skillDir, repoRoot, presentPaths) {
  const firstSegment = base.split('/')[0];

  if (SKILL_RELATIVE_SEGMENTS.has(firstSegment) || base === 'SKILL.md') {
    const resolved = path.join(skillDir, base);
    if (existsSync(resolved) && presentPaths.has(path.relative(repoRoot, resolved))) {
      return { kind: 'skill-relative', found: true, resolved };
    }
    return { kind: 'skill-relative', found: false };
  }

  if (SKILL_NAME_RE.test(firstSegment)) {
    if (!existsSync(path.join(SKILLS_ROOT, firstSegment))) {
      return { kind: 'skill-name-prefixed', found: false, noSuchSkill: true };
    }
    const resolved = path.join(SKILLS_ROOT, base);
    if (existsSync(resolved) && presentPaths.has(path.relative(repoRoot, resolved))) {
      return { kind: 'skill-name-prefixed', found: true, resolved };
    }
    return { kind: 'skill-name-prefixed', found: false };
  }

  return { kind: 'none' };
}

function classifyCommand(token) {
  let m;
  if ((m = /^mise run (\S+)/.exec(token))) {
    return { type: 'mise', task: m[1] };
  }
  if ((m = /^npm --prefix frontend run (\S+)/.exec(token))) {
    return { type: 'npm', area: 'frontend', script: m[1] };
  }
  if ((m = /^npm --prefix tools run (\S+)/.exec(token))) {
    return { type: 'npm', area: 'tools', script: m[1] };
  }
  if ((m = /^backend\/gradlew -p backend :services:commerce:(\S+)/.exec(token))) {
    return { type: 'gradle', task: m[1] };
  }
  if ((m = /^node\s+(?:-\S+\s+)*([^-\s]\S*)/.exec(token))) {
    return { type: 'script', scriptPath: m[1] };
  }
  if ((m = /^uv run\b.*\bpython\s+(?:-\S+\s+)*([^-\s]\S*)/.exec(token))) {
    return { type: 'script', scriptPath: m[1] };
  }
  return null;
}

// Matches a fenced code block delimiter at the start of a (leading-whitespace
// trimmed) line: three or more backticks or three or more tildes.
const FENCE_START_RE = /^(`{3,}|~{3,})/;

// Every line inside a fenced code block (``` or ~~~, with or without a
// language tag after the opening fence), the fence delimiter lines
// themselves excluded. A closing fence is the same character repeated at
// least as many times as the opening fence, with nothing else on the line
// once leading/trailing whitespace is trimmed.
function extractFencedLines(lines) {
  const result = [];
  let inFence = false;
  let fenceChar = null;
  let fenceLen = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].replace(/^\s+/, '');
    const m = FENCE_START_RE.exec(trimmed);
    if (!inFence) {
      if (m) {
        inFence = true;
        fenceChar = m[1][0];
        fenceLen = m[1].length;
      }
      continue;
    }
    if (m && m[1][0] === fenceChar && m[1].length >= fenceLen && trimmed.slice(m[1].length).trim() === '') {
      inFence = false;
      fenceChar = null;
      fenceLen = 0;
      continue;
    }
    result.push({ lineNo: i + 1, text: lines[i] });
  }
  return result;
}

// Trims leading whitespace and an optional `$ ` shell prompt from a
// fenced-block line, before it is tried as a command candidate.
function stripPrompt(text) {
  const trimmed = text.replace(/^\s+/, '');
  return trimmed.startsWith('$ ') ? trimmed.slice(2) : trimmed;
}

// Fenced-block command candidates, one per (possibly continuation-joined)
// logical line: a physical line ending with a trailing `\` (once trailing
// whitespace is ignored) is joined with the next physical line, provided
// that next line is still inside the same fenced block (its line number is
// exactly one past the line just consumed).
function extractFencedCommands(lines) {
  const fencedLines = extractFencedLines(lines);
  const commands = [];
  let i = 0;
  while (i < fencedLines.length) {
    const startLineNo = fencedLines[i].lineNo;
    let lastLineNo = startLineNo;
    let stripped = stripPrompt(fencedLines[i].text);
    for (;;) {
      const trimmedEnd = stripped.replace(/\s+$/, '');
      if (!trimmedEnd.endsWith('\\')) break;
      const nextIdx = i + 1;
      if (nextIdx >= fencedLines.length) break;
      const next = fencedLines[nextIdx];
      if (next.lineNo !== lastLineNo + 1) break;
      const withoutBackslash = trimmedEnd.slice(0, -1).replace(/\s+$/, '');
      stripped = `${withoutBackslash} ${stripPrompt(next.text)}`;
      lastLineNo = next.lineNo;
      i = nextIdx;
    }
    commands.push({ lineNo: startLineNo, text: stripped });
    i += 1;
  }
  return commands;
}

function loadPackageScripts(repoRoot, area) {
  const pkgPath = path.join(repoRoot, area, 'package.json');
  if (!existsSync(pkgPath)) return null;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  return { scripts: pkg.scripts ?? {}, relPath: path.join(area, 'package.json') };
}

// A machine path starts a path: it opens the line or follows a character that
// cannot sit inside a repository-relative path. Without that boundary the
// storefront's features/home/ folder reads as a Linux home directory.
const PATH_START = '(?:^|[\\s`\'"(\\[{<>=:;,|])';
const HYGIENE_PATTERNS = [
  { token: '/Users/', re: new RegExp(`${PATH_START}/Users/`) },
  { token: '/home/', re: new RegExp(`${PATH_START}/home/`) },
  { token: '~/', re: new RegExp(`${PATH_START}~/`) },
  { token: '/tmp/', re: new RegExp(`${PATH_START}(?:/private)?(?:/var)?/tmp/`) },
  { token: '/var/folders/', re: new RegExp(`${PATH_START}(?:/private)?/var/folders/`) },
  { token: 'file://', re: /file:\/\// },
];

// Check (f): harness-specific naming banned from every MiBolt skill's
// SKILL.md and references/*.md, so the skills describe only the project.
// The first pattern is built from string parts so this script's own source
// never spells the literal path component it looks for, contiguously, in
// its own text.
const CLAUDE_DIR_SEGMENT = '.' + 'claude';
const NEUTRAL_WORDING_PATTERNS = [
  new RegExp(`(?:^|[^A-Za-z0-9_])(${escapeRegExp(CLAUDE_DIR_SEGMENT)}(?![A-Za-z0-9_]))`, 'gi'),
  /\b((?:CLAUDE|AGENTS|GEMINI)\.md)\b/gi,
  /(?:^|[^A-Za-z0-9_])(\.agents\/)/gi,
  /\b(claude|codex|anthropic|openai|gemini|copilot|opus|sonnet|haiku)\b/gi,
  /\b(orchestrator|orchestrators|subagent|subagents|sub-agent|sub-agents|spawn|spawns|spawned|spawning)\b/gi,
  /\b([a-z]+(?:-[a-z]+)*-(?:opus|sonnet|haiku)(?:-xhigh)?)\b/gi,
  /\b(playwright-test-[a-z]+)\b/gi,
  /(mcp__)/gi,
  /\b(MCP)\b/g,
  /(chrome-devtools)/gi,
  /\b(AskUserQuestion|TaskCreate|TaskUpdate|SendMessage|TodoWrite)\b/gi,
  /\b(Skill tool|Agent tool)\b/gi,
  /\b(model-routing|git-commit|playwright-tests|task-execute-workflow|linear-conventions|memory-review|angular-developer|angular-new-app|skill-creator|coder-agent|agent-memory|retrospective)\b/gi,
];

// Collapses every run of whitespace (newlines included) in `text` to a
// single space, and returns, alongside the collapsed string, an index map
// from each collapsed-string offset back to the original-string offset it
// came from (a whitespace run maps to the offset of its first character).
function collapseWhitespace(text) {
  let collapsed = '';
  const indexMap = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    if (/\s/.test(text[i])) {
      const start = i;
      while (i < n && /\s/.test(text[i])) i += 1;
      collapsed += ' ';
      indexMap.push(start);
    } else {
      indexMap.push(i);
      collapsed += text[i];
      i += 1;
    }
  }
  return { collapsed, indexMap };
}

function buildLineOffsets(text) {
  const offsets = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') offsets.push(i + 1);
  }
  return offsets;
}

function lineNumberAtOffset(offsets, index) {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

// (e) section-name citations: `` `<target>` ("<name>" `` (optionally with a
// `'s` between the backticked target and the space) or
// `` `<target>`, "<name>" ``. Matched against the whitespace-collapsed text,
// so the captured `<name>` group is itself already whitespace-collapsed.
const SECTION_CITATION_RE = /`([^`]+)`(?:'s)? \("([^"]*)"|`([^`]+)`, "([^"]*)"/g;

const PATH_TARGET_EXTENSION_RE = /\.[A-Za-z0-9]{1,10}$/;

// A citation target is a skill name when it matches `mibolt-<name>`; a path
// target only when it contains a `/` or its last segment has a file
// extension (a dot followed by 1-10 alphanumerics, e.g. `SKILL.md`,
// `mise.toml`); any other token is not a citation at all.
function classifySectionTarget(target) {
  if (SKILL_NAME_RE.test(target)) return 'skill';
  if (target.includes('/') || PATH_TARGET_EXTENSION_RE.test(target)) return 'path';
  return 'none';
}

// Resolves a file-path (any file, not only `.md`) section target the way
// check (b) resolves a path token (repo-relative, anchor stripped), and when
// that does not exist, relative to the skill directory being checked (so
// `SKILL.md` and `references/x.md` resolve inside the skill), and when that
// does not exist either, against the skills root when the target's first
// path segment matches `mibolt-<name>` and names a directory there. Returns
// `{ found: false }` when no resolution exists; `{ found: false,
// noSuchSkill: true }` when the first segment matches the skill-name pattern
// but names no such skill; `{ found: true, isDirectory: true }` when the
// resolved target is a directory; or `{ found: true, text }` with the
// whitespace-collapsed file text.
function resolveSectionPathText(target, repoRoot, skillDir, presentPaths) {
  const { base } = splitAnchor(target);
  const repoResolved = path.resolve(repoRoot, base);
  let resolved = null;
  if (existsSync(repoResolved) && presentPaths.has(path.relative(repoRoot, repoResolved))) {
    resolved = repoResolved;
  } else {
    const skillResolved = path.resolve(skillDir, base);
    if (existsSync(skillResolved) && presentPaths.has(path.relative(repoRoot, skillResolved))) {
      resolved = skillResolved;
    } else {
      const firstSegment = base.split('/')[0];
      if (SKILL_NAME_RE.test(firstSegment)) {
        if (!existsSync(path.join(SKILLS_ROOT, firstSegment))) {
          return { found: false, noSuchSkill: true };
        }
        const skillsRootResolved = path.join(SKILLS_ROOT, base);
        if (existsSync(skillsRootResolved) && presentPaths.has(path.relative(repoRoot, skillsRootResolved))) {
          resolved = skillsRootResolved;
        }
      }
    }
  }
  if (resolved === null) return { found: false };
  if (statSync(resolved).isDirectory()) return { found: true, isDirectory: true };
  return { found: true, text: collapseWhitespace(readFileSync(resolved, 'utf8')).collapsed };
}

// Resolves a `mibolt-<name>` skill-name section target to the
// whitespace-collapsed, concatenated text of that skill's SKILL.md plus all
// its references/*.md. Returns null when that skill directory does not
// exist.
function resolveSectionSkillTargetText(target) {
  const targetSkillDir = path.join(SKILLS_ROOT, target);
  if (!existsSync(path.join(targetSkillDir, 'SKILL.md'))) return null;
  const files = collectSkillFiles(targetSkillDir);
  return files.map((f) => collapseWhitespace(readFileSync(f, 'utf8')).collapsed).join(' ');
}

function checkFile(absPath, skillDir, repoRoot, ctx, options) {
  const relToSkill = path.relative(skillDir, absPath);
  const content = readFileSync(absPath, 'utf8');
  const lines = content.split('\n');
  const findings = [];
  const infoLines = [];
  let checked = 0;

  const npmScriptsCache = ctx.npmScriptsCache;
  const gradleCache = ctx.gradleCache;

  // Check (c): resolves and reports one already-classified command, shared by
  // the backticked-inline-token loop below and the fenced-code-block pass
  // near the end of this function, so a command is checked identically
  // whichever form it was found in.
  function checkCommand(command, token, lineNo) {
    checked += 1;
    if (command.type === 'mise') {
      const taskName = command.task.startsWith('//') ? command.task : `//:${command.task}`;
      if (options.noMise) {
        findings.push({
          status: 'UNVERIFIED',
          line: lineNo,
          kind: 'mise',
          token,
          reason: 'mise task check skipped (--no-mise)',
        });
      } else {
        const taskNames = getMiseTaskNames(repoRoot);
        if (!taskNames.has(taskName)) {
          findings.push({
            status: 'FAIL',
            line: lineNo,
            kind: 'mise',
            token,
            reason: `mise task not found: ${taskName}`,
          });
        }
      }
    } else if (command.type === 'npm') {
      if (!npmScriptsCache[command.area]) {
        npmScriptsCache[command.area] = loadPackageScripts(repoRoot, command.area);
      }
      const pkg = npmScriptsCache[command.area];
      const relPath = pkg ? pkg.relPath : path.join(command.area, 'package.json');
      if (!pkg || !(command.script in pkg.scripts)) {
        findings.push({
          status: 'FAIL',
          line: lineNo,
          kind: 'npm',
          token,
          reason: `npm script not found in ${relPath}`,
        });
      }
    } else if (command.type === 'gradle') {
      if (!gradleTaskVerified(repoRoot, command.task, gradleCache)) {
        findings.push({
          status: 'UNVERIFIED',
          line: lineNo,
          kind: 'gradle',
          token,
          reason: 'Gradle task cannot be verified statically',
        });
      }
    } else if (command.type === 'script') {
      // Rule 3: skill-relative, then skill-name-prefixed, then the
      // repository root as a last resort (today's unconditional check).
      const scriptRes = resolvePathBase(command.scriptPath, skillDir, repoRoot, ctx.presentPaths);
      if (scriptRes.kind === 'none') {
        const resolved = path.resolve(repoRoot, command.scriptPath);
        if (!existsSync(resolved) || !ctx.presentPaths.has(path.relative(repoRoot, resolved))) {
          findings.push({
            status: 'FAIL',
            line: lineNo,
            kind: 'script',
            token,
            reason: 'script path does not exist in a fresh checkout',
          });
        }
      } else if (scriptRes.noSuchSkill) {
        findings.push({ status: 'FAIL', line: lineNo, kind: 'script', token, reason: 'no such skill' });
      } else if (!scriptRes.found) {
        findings.push({
          status: 'FAIL',
          line: lineNo,
          kind: 'script',
          token,
          reason: 'script path does not exist in a fresh checkout',
        });
      }
    }
  }

  // Shared by both the skill-relative/skill-name-prefixed branch and the
  // top-level-repo-entry branch of (b): once a token's base has resolved to
  // a real file or directory, its anchor is checked the same way regardless
  // of which rule resolved it.
  function reportAnchor(resolved, anchor, token, base, lineNo) {
    if (statSync(resolved).isDirectory()) {
      findings.push({ status: 'FAIL', line: lineNo, kind: 'anchor', token, reason: 'line anchor on a directory' });
      return;
    }
    const upperBounds = anchorUpperBounds(anchor);
    const maxLine = Math.max(...upperBounds);
    const lineCount = fileLineCount(resolved);
    if (maxLine > lineCount) {
      findings.push({
        status: 'FAIL',
        line: lineNo,
        kind: 'anchor',
        token,
        reason: `line ${maxLine} exceeds file with ${lineCount} lines`,
      });
      return;
    }
    if (options.showAnchors) {
      const targetLines = readFileSync(resolved, 'utf8').split('\n');
      const shown = [];
      for (const part of anchor.split(',')) {
        const [nStr, mStr] = part.split('-');
        const n = Number(nStr);
        const m = mStr ? Number(mStr) : n;
        for (let ln = n; ln <= Math.min(m, n + 9); ln += 1) {
          shown.push(`${ln}: ${targetLines[ln - 1] ?? ''}`);
        }
        if (m > n + 9) shown.push(`... (+${m - (n + 9)} more lines)`);
      }
      infoLines.push(
        `ANCHOR ${relToSkill}:${lineNo} ${token} -> ${base}\n  ${shown.join('\n  ')}`,
      );
    }
  }

  lines.forEach((lineText, idx) => {
    const lineNo = idx + 1;

    // (d) hygiene
    for (const pattern of HYGIENE_PATTERNS) {
      if (pattern.re.test(lineText)) {
        checked += 1;
        findings.push({
          status: 'FAIL',
          line: lineNo,
          kind: 'hygiene',
          token: pattern.token,
          reason: 'machine-specific path or file:// URL',
        });
      }
    }

    // (f) neutral wording: every distinct matched text, once per pattern.
    for (const re of NEUTRAL_WORDING_PATTERNS) {
      re.lastIndex = 0;
      const seen = new Set();
      let neutralMatch;
      while ((neutralMatch = re.exec(lineText))) {
        seen.add(neutralMatch[1]);
      }
      for (const matchedText of seen) {
        checked += 1;
        findings.push({
          status: 'FAIL',
          line: lineNo,
          kind: 'neutral',
          token: matchedText,
          reason: 'harness-specific name or path',
        });
      }
    }

    // (a) relative Markdown links
    const linkRe = /\[[^\]]*\]\(([^)]+)\)/g;
    let linkMatch;
    while ((linkMatch = linkRe.exec(lineText))) {
      const target = linkMatch[1].trim();
      if (target === '' || target.startsWith('#')) continue;
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue; // absolute URL / scheme
      const withoutFragment = target.split('#')[0];
      if (withoutFragment === '') continue;
      checked += 1;
      const resolved = path.resolve(path.dirname(absPath), withoutFragment);
      if (!existsSync(resolved)) {
        findings.push({
          status: 'FAIL',
          line: lineNo,
          kind: 'link',
          token: target,
          reason: 'target does not exist',
        });
      }
    }

    // backticked tokens: (b) and (c)
    const tokenRe = /`([^`]+)`/g;
    let tokenMatch;
    while ((tokenMatch = tokenRe.exec(lineText))) {
      const token = tokenMatch[1];

      const command = classifyCommand(token);
      if (command) {
        checkCommand(command, token, lineNo);
        continue;
      }

      // (b) path / anchor / glob, only for whitespace-free tokens.
      if (/\s/.test(token)) continue;
      const { base, anchor } = splitAnchor(token);

      // Rule 1 (skill-relative) and rule 2 (skill-name-prefixed): resolved
      // against the skill whose file contains it, or the skills root,
      // never against the repository root.
      const skillPathRes = resolvePathBase(base, skillDir, repoRoot, ctx.presentPaths);
      if (skillPathRes.kind !== 'none') {
        checked += 1;
        if (skillPathRes.noSuchSkill) {
          findings.push({ status: 'FAIL', line: lineNo, kind: 'path', token, reason: 'no such skill' });
          continue;
        }
        if (!skillPathRes.found) {
          findings.push({
            status: 'FAIL',
            line: lineNo,
            kind: 'path',
            token,
            reason: 'path does not exist in a fresh checkout',
          });
          continue;
        }
        if (anchor !== null) {
          reportAnchor(skillPathRes.resolved, anchor, token, base, lineNo);
        }
        continue;
      }

      // Rule 4 (unchanged): a token whose first segment is a real top-level
      // entry of the repo.
      const firstSegment = base.split('/')[0].split(':')[0];
      if (!ctx.topLevelEntries.has(firstSegment)) continue;

      checked += 1;

      // `backend:docker` names a mise task, not a path: a colon in a token with
      // no slash and no line anchor cannot belong to a repository path.
      if (anchor === null && !base.includes('/') && base.includes(':')) {
        const [area, ...rest] = base.split(':');
        const names = [`//:${base}`, `//${area}:${rest.join(':')}`];
        if (options.noMise) {
          findings.push({ status: 'UNVERIFIED', line: lineNo, kind: 'mise', token, reason: 'mise task check skipped (--no-mise)' });
        } else if (!names.some((name) => getMiseTaskNames(repoRoot).has(name))) {
          findings.push({ status: 'FAIL', line: lineNo, kind: 'mise', token, reason: `neither a path nor a mise task: ${names.join(', ')}` });
        }
        continue;
      }

      if (base.includes('*')) {
        if (!checkGlob(base, ctx.presentPaths)) {
          findings.push({
            status: 'FAIL',
            line: lineNo,
            kind: 'path',
            token,
            reason: 'glob matches no path a fresh checkout holds',
          });
        }
        continue;
      }

      const resolved = path.resolve(repoRoot, base);
      if (!existsSync(resolved) || !ctx.presentPaths.has(path.relative(repoRoot, resolved))) {
        findings.push({
          status: 'FAIL',
          line: lineNo,
          kind: 'path',
          token,
          reason: 'path does not exist in a fresh checkout',
        });
        continue;
      }

      if (anchor !== null) {
        reportAnchor(resolved, anchor, token, base, lineNo);
      }
    }
  });

  // (c) fenced-block commands: computed once per file, independent of the
  // per-line loop above, since a continued command can span two physical
  // lines.
  for (const { lineNo, text } of extractFencedCommands(lines)) {
    if (text.includes('<') || text.includes('*')) continue; // placeholder/glob: skipped, like (e)
    const command = classifyCommand(text);
    if (!command) continue; // matches none of the recognised command forms
    checkCommand(command, text, lineNo);
  }

  // (e) section-name citations: scanned on the whole file's
  // whitespace-collapsed text, since a citation can wrap across lines, so
  // this runs once per file rather than inside the per-line loop above.
  const { collapsed, indexMap } = collapseWhitespace(content);
  const lineOffsets = buildLineOffsets(content);
  SECTION_CITATION_RE.lastIndex = 0;
  let citationMatch;
  while ((citationMatch = SECTION_CITATION_RE.exec(collapsed))) {
    const target = citationMatch[1] ?? citationMatch[3];
    const name = citationMatch[2] ?? citationMatch[4];
    const lineNo = lineNumberAtOffset(lineOffsets, indexMap[citationMatch.index]);
    const citationToken = `${target} "${name}"`;
    const targetKind = SKILL_NAME_RE.test(target) ? 'skill' : classifySectionTarget(splitAnchor(target).base) === 'path' ? 'path' : 'none';
    if (targetKind === 'none') continue; // not a citation: a flag or a bare value

    if (targetKind === 'skill') {
      const targetText = resolveSectionSkillTargetText(target);
      checked += 1;
      if (targetText === null) {
        findings.push({
          status: 'FAIL',
          line: lineNo,
          kind: 'section',
          token: citationToken,
          reason: 'no such skill',
        });
      } else if (!targetText.includes(name)) {
        findings.push({
          status: 'FAIL',
          line: lineNo,
          kind: 'section',
          token: citationToken,
          reason: `section name not found in ${target}`,
        });
      }
      continue;
    }

    const result = resolveSectionPathText(target, repoRoot, skillDir, ctx.presentPaths);
    if (result.noSuchSkill) {
      checked += 1;
      findings.push({
        status: 'FAIL',
        line: lineNo,
        kind: 'section',
        token: citationToken,
        reason: 'no such skill',
      });
      continue;
    }
    if (!result.found) {
      // Same test as (b) above: a whitespace-free target whose first segment
      // is a top-level repo entry is the token (b) already reports, so this
      // stays silent; a placeholder/glob target is also silent since it is
      // not meant to resolve.
      const firstSegment = target.split('/')[0].split(':')[0];
      if (!/\s/.test(target) && ctx.topLevelEntries.has(firstSegment)) continue;
      if (target.includes('<') || target.includes('*')) continue;
      checked += 1;
      findings.push({
        status: 'FAIL',
        line: lineNo,
        kind: 'section',
        token: citationToken,
        reason: 'section target not found',
      });
      continue;
    }

    checked += 1;
    if (result.isDirectory) {
      findings.push({
        status: 'UNVERIFIED',
        line: lineNo,
        kind: 'section',
        token: citationToken,
        reason: 'section target is a directory',
      });
    } else if (!result.text.includes(name)) {
      findings.push({
        status: 'FAIL',
        line: lineNo,
        kind: 'section',
        token: citationToken,
        reason: `section name not found in ${target}`,
      });
    }
  }

  return { findings, infoLines, checked, relToSkill };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = getRepoRoot();
  const skillDirs = resolveSkillDirs(options.skillDirs);
  const gitFiles = getGitLsFiles(repoRoot);
  const topLevelEntries = new Set(gitFiles.map((f) => f.split('/')[0]));
  const presentPaths = getPresentPaths(repoRoot);

  // Settle the mise prerequisite before any output, so exit 2 never follows a
  // summary line that already printed.
  if (!options.noMise) getMiseTaskNames(repoRoot);

  let anyFail = false;

  for (const skillDir of skillDirs) {
    const skillName = path.basename(skillDir);
    const files = collectSkillFiles(skillDir);
    const ctx = { presentPaths, topLevelEntries, npmScriptsCache: {}, gradleCache: { loaded: false } };

    let totalChecked = 0;
    let totalFail = 0;
    let totalUnverified = 0;
    const outLines = [];

    for (const file of files) {
      const { findings, infoLines, checked, relToSkill } = checkFile(
        file,
        skillDir,
        repoRoot,
        ctx,
        options,
      );
      totalChecked += checked;
      for (const finding of findings) {
        if (finding.status === 'FAIL') totalFail += 1;
        else totalUnverified += 1;
        outLines.push(
          `${finding.status} ${relToSkill}:${finding.line} ${finding.kind} ${finding.token} — ${finding.reason}`,
        );
      }
      outLines.push(...infoLines);
    }

    for (const line of outLines) process.stdout.write(`${line}\n`);
    process.stdout.write(
      `${skillName}: ${totalChecked} checked, ${totalFail} FAIL, ${totalUnverified} UNVERIFIED\n`,
    );

    if (totalFail > 0) anyFail = true;
  }

  process.exitCode = anyFail ? 1 : 0;
}

main();
