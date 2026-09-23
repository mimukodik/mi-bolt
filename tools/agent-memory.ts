#!/usr/bin/env tsx
/**
 * CLI entry for the workspace's shared memory. `pnpm claude:memory --help`
 * explains the commands.
 *
 * Nothing but wiring lives here: argv in, exit code out. The commands
 * themselves are in scripts/agent-memory/, which the changed-line coverage
 * gate covers like any other source. This file is listed in
 * COVERAGE_GATE_EXCLUDED_PATHS because a unit test cannot enter it without
 * running the whole CLI; it is verified by being executed.
 */
import { run } from "./agent-memory/cli/run";
import { createIo, REPO_ROOT } from "./agent-memory/io/io";

process.exit(run(process.argv.slice(2), createIo(REPO_ROOT)));
