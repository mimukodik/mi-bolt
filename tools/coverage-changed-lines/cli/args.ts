/**
 * Command line parsing for the changed-line coverage gate. Pure: no I/O, no
 * exits.
 */

/** Which comparison the gate measures. */
export type DiffMode =
  | { readonly kind: "worktree" }
  | { readonly kind: "base"; readonly ref: string }
  | { readonly kind: "range"; readonly expression: string };

/** A fully parsed invocation. */
export interface Options {
  readonly mode: DiffMode;
  readonly skipRun: boolean;
}

/** Outcome of parsing argv. */
export type ParseResult =
  | { readonly kind: "options"; readonly options: Options }
  | { readonly kind: "help" }
  | { readonly kind: "error"; readonly message: string };

export const HELP = `Usage:
  pnpm coverage:changed-lines [options]

Fails when a line the diff adds or modifies is not executed by a test, per the
100% changed-line coverage rule in .claude/rules/code-standards.md.

Comparison (pick at most one; the default is the uncommitted working tree):
  (none)            Working tree against HEAD, staged and unstaged, plus
                    untracked files. This is the check to run before committing.
  --base <ref>      <ref>...HEAD, so only what this branch added since it left
                    <ref>. Rename detection is on, so moved code is not
                    counted as new. Example: --base main
  --range <expr>    Handed to \`git diff\` unchanged, for anything the two
                    modes above cannot express. Example: --range HEAD~3..HEAD

Options:
  --skip-run        Do not run the suites; read the coverage reports already on
                    disk. Use while iterating on the same test run.
  -h, --help        Print this help.

Exit codes:
  0  every touched line is covered
  1  uncovered touched lines were found, and are listed as file:line
  2  the gate could not measure: bad usage, or a suite that failed`;

/** Parses argv, returning either the options, a help request, or a message. */
export function parseArgs(argv: readonly string[]): ParseResult {
  let mode: DiffMode | undefined;
  let skipRun = false;

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index] ?? "";
    const separator = argument.indexOf("=");
    const flag = separator === -1 ? argument : argument.slice(0, separator);
    const inlineValue =
      separator === -1 ? undefined : argument.slice(separator + 1);

    switch (flag) {
      case "-h":
      case "--help":
        return { kind: "help" };
      case "--skip-run":
        skipRun = true;
        break;
      case "--base":
      case "--range": {
        if (mode) {
          return {
            kind: "error",
            message: "Pass at most one of --base and --range.",
          };
        }
        const value = inlineValue ?? argv[++index];
        // A flag is never the value: `--base --skip-run` is a forgotten ref,
        // not a branch named --skip-run. `--base=--odd` still gets through,
        // because writing it inline is saying so on purpose.
        if (!value || (inlineValue === undefined && value.startsWith("--")))
          return { kind: "error", message: `Missing value for ${flag}.` };
        mode =
          flag === "--base"
            ? { kind: "base", ref: value }
            : { kind: "range", expression: value };
        break;
      }
      default:
        return { kind: "error", message: `Unknown argument: ${argument}` };
    }
  }

  return {
    kind: "options",
    options: { mode: mode ?? { kind: "worktree" }, skipRun },
  };
}
