#!/usr/bin/env tsx
/**
 * CLI entry for the workspace's shared memory. `mise run claude:memory --help`
 * explains the commands.
 *
 * Nothing but wiring lives here: argv in, exit code out. The commands
 * themselves are in tools/agent-memory/. A unit test cannot enter this file
 * without running the whole CLI, so it is verified by being executed.
 */
import { run } from "./agent-memory/cli/run";
import { createIo, REPO_ROOT } from "./agent-memory/io/io";

process.exit(run(process.argv.slice(2), createIo(REPO_ROOT)));
