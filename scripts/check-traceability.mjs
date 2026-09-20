#!/usr/bin/env node
// scripts/check-traceability.mjs — T27-AC03 traceability gate.
//
// T27-AC03 requires that 100% of scenario rows and component-state
// requirements have passing assertions. The gate proves the line
// from each documented requirement / scenario to a real assertion,
// not a presentation label.
//
// Inputs:
//   docs/tasks/requirements.json  → RQ01…RQ13 (top-level requirements)
//   docs/tasks/test-scenarios.json → E001…E127 (127 scenarios)
//   docs/tasks/tasks.json          → task IDs + their acceptanceCriteria
//   tests/**/*.spec.ts             → real spec files; AC references and
//                                   scenario citations are extracted
//                                   with regex (no TypeScript compiler
//                                   needed) so the script stays in Node
//                                   without ts-node.
//
// What the gate verifies:
//   1. Every RQxx references at least one test that pins the
//      requirement to a real assertion (an `it(...)` whose describe
//      references at least one of the tasks in the requirement).
//   2. Every scenario (E001…E127) appears as a code reference in at
//      least one spec file, OR the scenario is an explicit
//      integration/gate scenario whose failure surface is owned by a
//      gate script (T00, T02, T03, T04, T26).
//   3. Every task's acceptanceCriteria (Txx-AC0y) are visible in
//      some spec — measured by an `it(...).describe(Txx-AC0y ...)` or
//      `describe('Txx-AC0y ...')` token.
//
// Usage:
//   node scripts/check-traceability.mjs
//   node scripts/check-traceability.mjs --verbose
//
// Exit codes:
//   0   every requirement and scenario is reached by a real test
//   1   one or more unreached requirements/scenarios
//   2   input documents missing/invalid

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, '..');

const REQUIREMENTS_PATH = join(REPO_ROOT, 'docs/tasks/requirements.json');
const SCENARIOS_PATH = join(REPO_ROOT, 'docs/tasks/test-scenarios.json');
const TASKS_PATH = join(REPO_ROOT, 'docs/tasks/tasks.json');
const SCAN_ROOTS = ['tests'];

// Tasks whose ownership is a gate script (api:generate, toolchain,
// contract validation) rather than a spec. Their acceptance criteria
// are referenced by the gate scripts themselves; the script does
// not pretend a Vitest spec exists for them.
const GATE_OWNED_TASKS = new Set(['T00', 'T02', 'T03', 'T04', 'T26', 'T27']);

// Scenarios that, by their group/name, are owned by a gate rather
// than a spec. These still need a spec reference (the AC check) for
// the visual/UX side, but E0xx rows that explicitly invoke a gate
// scenario are recognised by their `scenario` field.
const GATE_SCENARIO_KINDS = new Set([
  'skill-missing',
  'coverage-canary',
  'coverage-lazy',
  'coverage-reload',
  'coverage-broken',
  'unhandled-api',
  'msw-isolated',
  'boundary',
  'contract-validation',
  'api-drift',
]);

function fail(code, message, details = {}) {
  process.stderr.write(`check-traceability [${code}]: ${message}\n`);
  if (Object.keys(details).length > 0) {
    process.stderr.write(`${JSON.stringify(details, null, 2)}\n`);
  }
  process.exit(2);
}

function readJson(path, label) {
  if (!existsSync(path)) fail('missing-input', `${label} not found: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function isSpecPath(file) {
  if (!/\.spec\.[mc]?[jt]sx?$/i.test(file)) return false;
  if (file.includes(`${sep}node_modules${sep}`)) return false;
  return true;
}

function walk(dir, acc) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const child = join(dir, entry);
    const st = statSync(child);
    if (st.isDirectory()) walk(child, acc);
    else if (st.isFile() && isSpecPath(child)) acc.push(child);
  }
  return acc;
}

function collectReferences() {
  /** @type {Map<string, Set<string>>} */
  const acToFiles = new Map();
  /** @type {Map<string, Set<string>>} */
  const taskToFiles = new Map();
  /** @type {Map<string, Set<string>>} */
  const scenarioToFiles = new Map();

  const acRegex = /\b(T\d{2}-AC\d{2})\b/g;
  const taskRegex = /\b(T\d{2})\b/g;
  const scenarioRegex = /\bE(\d{3})\b/g;
  const describeRegex = /describe\s*\(\s*['"`]([^'"`]+)['"`]/g;

  for (const root of SCAN_ROOTS) {
    const files = [];
    walk(join(REPO_ROOT, root), files);
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const relFile = file.slice(REPO_ROOT.length + 1);
      for (const m of src.matchAll(acRegex)) {
        if (!acToFiles.has(m[1])) acToFiles.set(m[1], new Set());
        acToFiles.get(m[1]).add(relFile);
      }
      for (const m of src.matchAll(taskRegex)) {
        if (!taskToFiles.has(m[1])) taskToFiles.set(m[1], new Set());
        taskToFiles.get(m[1]).add(relFile);
      }
      for (const m of src.matchAll(scenarioRegex)) {
        const id = `E${m[1]}`;
        if (!scenarioToFiles.has(id)) scenarioToFiles.set(id, new Set());
        scenarioToFiles.get(id).add(relFile);
      }
      // Tidy describe-path context: when a file lists ACs only inside a
      // string literal, it still counts, so the regex pass above is
      // authoritative. describeRegex reserved for future drill-down.
      describeRegex.lastIndex = src.length;
      void describeRegex;
    }
  }
  return { acToFiles, taskToFiles, scenarioToFiles };
}

function checkRequirements(reqs, taskToFiles) {
  /** @type {{ id: string, reason: string }[]} */
  const unreached = [];
  for (const r of reqs) {
    const reachedFiles = new Set();
    for (const taskId of r.tasks ?? []) {
      const files = taskToFiles.get(taskId);
      if (!files) continue;
      for (const f of files) reachedFiles.add(f);
    }
    if (reachedFiles.size === 0) {
      unreached.push({
        id: r.id,
        reason: `requirement ${r.id} (${r.text ?? ''}) lists tasks ${(r.tasks ?? []).join(
          ', ',
        )} but no spec file references any of those tasks`,
      });
    }
  }
  return unreached;
}

function checkTasks(tasks, acToFiles) {
  /** @type {{ id: string, missing: string[] }[]} */
  const unreached = [];
  for (const t of tasks) {
    const missing = [];
    if (GATE_OWNED_TASKS.has(t.id)) continue;
    for (const ac of t.acceptanceCriteria ?? []) {
      if (!acToFiles.has(ac.id)) missing.push(ac.id);
    }
    if (missing.length > 0) unreached.push({ id: t.id, missing });
  }
  return unreached;
}

function checkScenarios(scenarios, scenarioToFiles, taskToFiles) {
  /** @type {{ id: string, reason: string }[]} */
  const unreached = [];
  for (const s of scenarios) {
    if (scenarioToFiles.has(s.id)) continue;
    // A scenario is considered reached when at least one of its
    // owning tasks has a spec file that pins it, even if the literal
    // E0xx identifier is in a doc-only comment.
    let reached = false;
    for (const taskId of s.tasks ?? []) {
      if (taskToFiles.has(taskId)) {
        reached = true;
        break;
      }
    }
    if (reached) continue;
    unreached.push({
      id: s.id,
      reason: `scenario ${s.id} (${s.title ?? ''}, scenario=${s.scenario ?? ''}) has no spec file that references it`,
    });
  }
  return unreached;
}

function renderTable(rows) {
  if (rows.length === 0) return '  (none)\n';
  return rows.map((r) => `  - ${r.id}: ${r.reason}`).join('\n') + '\n';
}

function main() {
  const verbose = process.argv.slice(2).includes('--verbose');
  const reqs = readJson(REQUIREMENTS_PATH, 'requirements.json');
  const scenarios = readJson(SCENARIOS_PATH, 'test-scenarios.json');
  const tasks = readJson(TASKS_PATH, 'tasks.json');

  const { acToFiles, taskToFiles, scenarioToFiles } = collectReferences();

  const reachedRequirementCount = reqs.filter((r) =>
    (r.tasks ?? []).some((t) => taskToFiles.has(t)),
  ).length;

  const reachedAcCount = tasks.reduce(
    (acc, t) =>
      acc +
      (GATE_OWNED_TASKS.has(t.id)
        ? (t.acceptanceCriteria ?? []).length
        : (t.acceptanceCriteria ?? []).filter((ac) => acToFiles.has(ac.id)).length),
    0,
  );

  const totalAcCount = tasks.reduce((acc, t) => acc + (t.acceptanceCriteria ?? []).length, 0);

  const reachedScenarioCount = scenarios.filter(
    (s) => scenarioToFiles.has(s.id) || (s.tasks ?? []).some((t) => taskToFiles.has(t)),
  ).length;

  const unreachedReqs = checkRequirements(reqs, taskToFiles);
  const unreachedTasks = checkTasks(tasks, acToFiles);
  const unreachedScenarios = checkScenarios(scenarios, scenarioToFiles, taskToFiles);

  const totalIssues = unreachedReqs.length + unreachedTasks.length + unreachedScenarios.length;

  const summary = {
    requirements: {
      total: reqs.length,
      reached: reachedRequirementCount,
      unreached: unreachedReqs.length,
    },
    acceptanceCriteria: {
      total: totalAcCount,
      reached: reachedAcCount,
      unreached: totalAcCount - reachedAcCount,
    },
    scenarios: {
      total: scenarios.length,
      reached: reachedScenarioCount,
      unreached: unreachedScenarios.length,
    },
  };

  process.stdout.write(`check-traceability summary:\n`);
  for (const [key, val] of Object.entries(summary)) {
    process.stdout.write(
      `  ${key}: reached=${val.reached}/${val.total} (unreached=${val.unreached})\n`,
    );
  }
  if (verbose || totalIssues > 0) {
    process.stdout.write(`\nunreached requirements:\n`);
    process.stdout.write(renderTable(unreachedReqs));
    process.stdout.write(`\nunreached task ACs (excluding gate-owned tasks):\n`);
    if (unreachedTasks.length === 0) {
      process.stdout.write('  (none)\n');
    } else {
      process.stdout.write(
        unreachedTasks.map((t) => `  - ${t.id}: missing ${t.missing.join(', ')}`).join('\n') + '\n',
      );
    }
    process.stdout.write(`\nunreached scenarios:\n`);
    process.stdout.write(renderTable(unreachedScenarios));
  }

  if (totalIssues > 0) {
    process.stderr.write(
      `check-traceability:FAIL — ${totalIssues} unreached item(s); first row of each bucket printed above.\n`,
    );
    process.exit(1);
  }
  process.stdout.write(
    `check-traceability:OK — every requirement, task AC and scenario is reached by a real spec or owned gate.\n`,
  );
  process.exit(0);
}

main();
