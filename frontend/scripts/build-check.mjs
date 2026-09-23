#!/usr/bin/env node
// Wrap `ng build --configuration production` and fail the run when any
// output line looks like a warning. `ng build` itself has no fail-on-warning
// flag, so we run the build, echo its stdio line by line, classify each
// line, and decide the exit code at the end.
//
// Usage:
//   node scripts/build-check.mjs          # run ng build, stream + classify
//   node scripts/build-check.mjs --input <file>   # classify lines from a file
//   node scripts/build-check.mjs --help
//
// Exit code:
//   0  - no warnings and the build succeeded
//   1  - at least one warning was emitted
//   <build exit code>  - the build itself failed

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';

const USAGE = `Usage: node scripts/build-check.mjs [--input <file>] [--help]

Runs \`npx ng build --configuration production\` and fails (exit 1) if any
emitted line looks like a warning. Use --input to classify lines from a log
file instead of running the build (handy for fixtures and CI smoke tests).`;

const BUILD_COMMAND = 'npx';
const BUILD_ARGS = ['ng', 'build', '--configuration', 'production'];

// Strip ANSI colour/escape sequences so word boundaries in the patterns work
// even when "WARNING" or an NG code is wrapped in SGR codes by the builder.
// Matches the standard CSI sequence: ESC [ ... letter, plus the bare CSI
// introducer that some builders emit.
const ANSI_PATTERN = /\u001b\[[0-9;]*[A-Za-z]/g;

function stripAnsi(line) {
  return line.replace(ANSI_PATTERN, '');
}

// A line is a warning when it matches any of these patterns.
const WARNING_PATTERNS = [/\bWARNING\b/, /▲ \[WARNING\]/, /\bNG[0-9]{4}\b/];

const PREFIX = '  ! ';
const SUMMARY_PREFIX = 'build-check:';

function isWarning(line) {
  const plain = stripAnsi(line);
  return WARNING_PATTERNS.some((pattern) => pattern.test(plain));
}

function printUsage() {
  process.stdout.write(`${USAGE}\n`);
}

function parseArgs(argv) {
  const args = { input: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--input') {
      const next = argv[i + 1];
      if (!next) {
        process.stderr.write('build-check: --input requires a file path\n');
        process.exit(2);
      }
      args.input = next;
      i += 1;
    } else {
      process.stderr.write(`build-check: unknown argument: ${arg}\n`);
      process.exit(2);
    }
  }
  return args;
}

async function classify(stream, warnings) {
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    process.stdout.write(`${line}\n`);
    if (isWarning(line)) {
      warnings.push(line);
    }
  }
}

async function runBuild(warnings) {
  return new Promise((resolve) => {
    const child = spawn(BUILD_COMMAND, BUILD_ARGS, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    classify(child.stdout, warnings).catch(() => {});
    classify(child.stderr, warnings).catch(() => {});
    // A signal-killed build (SIGTERM from a CI timeout, OOM, etc.) closes
    // with code=null and signal=<name>; treat it as a failure so the gate
    // does not silently report success.
    child.on('close', (code, signal) => {
      resolve(signal ? 1 : (code ?? 0));
    });
  });
}

async function classifyFromFile(path, warnings) {
  await classify(createReadStream(path), warnings);
  return 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const warnings = [];
  const buildExit = args.input
    ? await classifyFromFile(args.input, warnings)
    : await runBuild(warnings);

  for (const line of warnings) {
    process.stdout.write(`${PREFIX}${line}\n`);
  }

  process.stdout.write(
    `${SUMMARY_PREFIX} ${warnings.length} warning line(s), build exit ${buildExit}\n`,
  );

  if (buildExit !== 0) {
    process.exitCode = buildExit;
  } else if (warnings.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`build-check: ${error.stack ?? error}\n`);
  process.exit(1);
});
