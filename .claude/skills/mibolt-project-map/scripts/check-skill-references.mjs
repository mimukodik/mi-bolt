#!/usr/bin/env node
// check-skill-references.mjs
//
// Purpose: check that every path, line anchor, and command cited inside a
// `mibolt-*` skill (its SKILL.md and its references/*.md files) still
// resolves against the current repository, so a skill does not go stale
// silently as the repo moves.
//
// Command (run from anywhere; the repo root is found via git):
//   node .claude/skills/mibolt-project-map/scripts/check-skill-references.mjs \
//     [--show-anchors] [--no-mise] [<skill-dir> ...]
//
// Arguments:
//   <skill-dir>   Zero or more paths to a `.claude/skills/mibolt-*`
//                 directory. With none given, every `.claude/skills/mibolt-*`
//                 directory in the repo is checked.
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
//   (b) every backticked token whose first path segment is a top-level entry
//       of `git ls-files`: a token with a colon, no slash and no line anchor,
//       such as `backend:docker`, is a mise task name and must appear in
//       `mise tasks --all --json` as `//:<token>` or `//<area>:<task>`; any
//       other token is a path, whose optional `:N` or `:N-M[,N-M...]` anchor
//       is stripped, and the path must exist on disk and be one a fresh
//       checkout holds (tracked, untracked but not ignored, or a directory
//       above one), so a gitignored output fails whether or not it was built
//       here; with an anchor, the path must be a file (an anchor on a
//       directory is reported FAIL, reason "line anchor on a directory") and
//       every upper line number must not exceed its line count; a token
//       containing `*` is a glob and must
//       match at least one such file or directory;
//   (c) commands: `mise run <task>` against `mise tasks --all --json`;
//       `npm --prefix frontend run <s>` / `npm --prefix tools run <s>`
//       against that package.json's "scripts"; `backend/gradlew -p backend
//       :services:commerce:<t>` against a `tasks.register('<t>'` in
//       backend/services/commerce/build.gradle, a `run` line of
//       backend/mise.toml, or a `./gradlew` line of
//       .github/workflows/backend.yml (reported UNVERIFIED when none of the
//       three has it, since Gradle tasks cannot be listed statically, and
//       never reported as a positive pass);
//   ... `node [options] <path>` and `uv run ... python [options] <path>`,
//       taking the first word that is not an option, resolved from the
//       repository root and held to the same fresh-checkout test as (b);
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
//       skill); or, when it is a skill name `mibolt-<name>`, as that skill's
//       SKILL.md plus all its references/*.md, concatenated. Four cases:
//       - the target resolves to a directory: reported UNVERIFIED, reason
//         "section target is a directory"; the name is not checked.
//       - the target is a `mibolt-<name>` skill name with no such skill
//         (no `.claude/skills/<name>/SKILL.md`): reported FAIL, reason
//         "no such skill".
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
//
// Output (to stdout): one line per finding,
//   `FAIL|UNVERIFIED <skill-relative-file>:<line> <kind> <token> — <reason>`
// (for kind `section`, `<token>` is `<target> "<name>"`), followed by one
// summary line per skill,
//   `<skill>: <n> checked, <f> FAIL, <u> UNVERIFIED`
// "checked" counts every individual (a)/(b)/(c)/(e) check plus every hygiene
// match found (a hygiene match is itself the unit of a hygiene check, since
// there is no separate notion of a hygiene check that passed); the two
// silent-skip cases in (e) count toward neither "checked", FAIL nor
// UNVERIFIED.
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

function resolveSkillDirs(repoRoot, positionalArgs) {
  const skillsRoot = path.join(repoRoot, '.claude', 'skills');
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

const SKILL_NAME_RE = /^mibolt-[a-z0-9-]+$/;
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
// `SKILL.md` and `references/x.md` resolve inside the skill). Returns
// `{ found: false }` when neither resolution exists, `{ found: true,
// isDirectory: true }` when the resolved target is a directory, or
// `{ found: true, text }` with the whitespace-collapsed file text.
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
function resolveSectionSkillTargetText(target, repoRoot) {
  const targetSkillDir = path.join(repoRoot, '.claude', 'skills', target);
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
        }
        continue;
      }

      // (b) path / anchor / glob, only for whitespace-free tokens whose
      // first segment is a real top-level entry of the repo.
      if (/\s/.test(token)) continue;
      const firstSegment = token.split('/')[0].split(':')[0];
      if (!ctx.topLevelEntries.has(firstSegment)) continue;

      checked += 1;
      const { base, anchor } = splitAnchor(token);

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
        if (statSync(resolved).isDirectory()) { findings.push({ status: 'FAIL', line: lineNo, kind: 'anchor', token, reason: 'line anchor on a directory' }); continue; }
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
        } else if (options.showAnchors) {
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
    }
  });

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
      const targetText = resolveSectionSkillTargetText(target, repoRoot);
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
  const skillDirs = resolveSkillDirs(repoRoot, options.skillDirs);
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
