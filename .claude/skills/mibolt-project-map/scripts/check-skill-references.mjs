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
//   --no-mise     Skip invoking `mise`. Every `mise run <task>` token is then
//                 reported UNVERIFIED instead of being checked.
//
// What it checks, in SKILL.md and references/*.md:
//   (a) every relative Markdown link resolves from the file's own directory;
//   (b) every backticked token whose first path segment is a top-level entry
//       of `git ls-files` must resolve: the optional `:N` or `:N-M[,N-M...]`
//       anchor is stripped and the path must exist; with an anchor, every
//       upper line number must not exceed the target file's line count; a
//       token containing `*` is treated as a glob and must match at least
//       one file tracked by git;
//   (c) commands: `mise run <task>` against `mise tasks --all --json`;
//       `npm --prefix frontend run <s>` / `npm --prefix tools run <s>`
//       against that package.json's "scripts"; `backend/gradlew -p backend
//       :services:commerce:<t>` against a `tasks.register('<t>'` in
//       backend/services/commerce/build.gradle, a `run` line of
//       backend/mise.toml, or a `./gradlew` line of
//       .github/workflows/backend.yml (reported UNVERIFIED when none of the
//       three has it, since Gradle tasks cannot be listed statically, and
//       never reported as a positive pass); `node <path>` and
//       `uv run ... python <path>` against the filesystem;
//   (d) hygiene: `/Users/`, `/home/`, `~/`, `/tmp/` and `file://` anywhere in
//       a checked file are reported as FAIL.
//
// Output (to stdout): one line per finding,
//   `FAIL|UNVERIFIED <skill-relative-file>:<line> <kind> <token> — <reason>`
// followed by one summary line per skill,
//   `<skill>: <n> checked, <f> FAIL, <u> UNVERIFIED`
// "checked" counts every individual (a)/(b)/(c) check plus every hygiene
// match found (a hygiene match is itself the unit of a hygiene check, since
// there is no separate notion of a hygiene check that passed).
//
// Diagnostics and usage/prerequisite errors go to stderr.
//
// Exit codes: 0 no FAIL anywhere; 1 at least one FAIL; 2 a usage or
// prerequisite error (nothing is reported in that case).
//
// Prerequisites: git; Node 26 (`mise.toml` pins `node = "26.10.0"`); mise on
// PATH for the `mise run` check, unless `--no-mise` is given.
//
// Read-only guarantee: this script only reads files and runs
// `git rev-parse --show-toplevel`, `git ls-files` and
// `mise tasks --all --json`. It makes no writes and no network calls.

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
  } catch {
    fail('mise not found on PATH; rerun with --no-mise to skip task checks');
  }
  const tasks = JSON.parse(out);
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

function checkGlob(token, gitFiles) {
  const re = globToRegExp(token);
  return gitFiles.some((f) => re.test(f));
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
  if ((m = /^node (\S+)/.exec(token))) {
    return { type: 'script', scriptPath: m[1] };
  }
  if ((m = /^uv run\b.*\bpython\s+(\S+)/.exec(token))) {
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

const HYGIENE_PATTERNS = ['/Users/', '/home/', '~/', '/tmp/', 'file://'];

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
      if (lineText.includes(pattern)) {
        checked += 1;
        findings.push({
          status: 'FAIL',
          line: lineNo,
          kind: 'hygiene',
          token: pattern,
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
          if (!existsSync(resolved)) {
            findings.push({
              status: 'FAIL',
              line: lineNo,
              kind: 'script',
              token,
              reason: 'script path does not exist',
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

      if (base.includes('*')) {
        if (!checkGlob(base, ctx.gitFiles)) {
          findings.push({
            status: 'FAIL',
            line: lineNo,
            kind: 'path',
            token,
            reason: 'glob matches no tracked file',
          });
        }
        continue;
      }

      const resolved = path.resolve(repoRoot, base);
      if (!existsSync(resolved)) {
        findings.push({
          status: 'FAIL',
          line: lineNo,
          kind: 'path',
          token,
          reason: 'path does not exist',
        });
        continue;
      }

      if (anchor !== null) {
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

  return { findings, infoLines, checked, relToSkill };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = getRepoRoot();
  const skillDirs = resolveSkillDirs(repoRoot, options.skillDirs);
  const gitFiles = getGitLsFiles(repoRoot);
  const topLevelEntries = new Set(gitFiles.map((f) => f.split('/')[0]));

  let anyFail = false;

  for (const skillDir of skillDirs) {
    const skillName = path.basename(skillDir);
    const files = collectSkillFiles(skillDir);
    const ctx = { gitFiles, topLevelEntries, npmScriptsCache: {}, gradleCache: { loaded: false } };

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

  process.exit(anyFail ? 1 : 0);
}

main();
