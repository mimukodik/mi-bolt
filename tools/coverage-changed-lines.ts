#!/usr/bin/env tsx
/**
 * CLI entry for the changed-line coverage gate. `pnpm coverage:changed-lines
 * --help` explains the flags.
 *
 * Nothing but wiring lives here: argv in, exit code out. The gate itself is in
 * scripts/coverage-changed-lines/, which the gate covers like any other
 * source. This file is the one path listed in COVERAGE_GATE_EXCLUDED_PATHS,
 * because a unit test cannot enter it without running the whole gate; it is
 * verified by being executed.
 */
import { run } from "./coverage-changed-lines/cli/run";
import { createIo } from "./coverage-changed-lines/io/io";

process.exit(run(process.argv.slice(2), createIo(process.cwd())));
