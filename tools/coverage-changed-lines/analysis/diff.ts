/**
 * Turns a unified diff into the set of lines each file added or modified.
 * Pure: the caller supplies the diff text.
 *
 * The diff is expected to come from `git diff -M --unified=0` with explicit
 * `--src-prefix=a/ --dst-prefix=b/`. Two properties of that invocation are
 * load-bearing:
 *
 * - `-M` turns on rename detection, so a moved file produces a rename header
 *   and only its genuinely changed lines as additions. Without it every line
 *   of a moved file would look new and the gate would demand tests for code
 *   that did not change.
 * - `--unified=0` drops context lines, so every `+` line in a hunk is a line
 *   the commit is responsible for.
 */

/** One file the diff touched, with the 1-based lines it added or modified. */
export interface TouchedFile {
  /** Repo-relative path, forward slashes. */
  readonly path: string;
  /** Ascending, unique. */
  readonly lines: readonly number[];
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/**
 * Parses a unified diff into touched files.
 *
 * Header lines are only read outside hunk bodies. Inside a hunk every line
 * carries a `+`, `-` or `\` prefix, so an added line whose own text is
 * `++ b/thing` would otherwise be indistinguishable from a `+++ b/thing`
 * file header.
 */
export function parseUnifiedDiff(diff: string): TouchedFile[] {
  const touched = new Map<string, Set<number>>();
  let currentPath: string | undefined;
  let inHunk = false;

  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      currentPath = undefined;
      inHunk = false;
      continue;
    }

    const hunk = HUNK_HEADER.exec(line);
    if (hunk) {
      inHunk = true;
      if (!currentPath) continue;
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      // A hunk that only deletes has a zero destination count and adds no
      // responsibility, so it must not register the file as touched.
      if (count === 0) continue;
      const lines = touched.get(currentPath) ?? new Set<number>();
      for (let offset = 0; offset < count; offset++) lines.add(start + offset);
      touched.set(currentPath, lines);
      continue;
    }

    if (inHunk) continue;

    if (line.startsWith("+++ ")) {
      currentPath = parseDestinationPath(line.slice(4));
    }
  }

  return [...touched]
    .map(([path, lines]) => ({ path, lines: [...lines].sort((a, b) => a - b) }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Reads the path out of a `+++ ` header. Returns undefined for a deletion,
 * whose destination is /dev/null.
 */
function parseDestinationPath(value: string): string | undefined {
  if (value === "/dev/null") return undefined;
  if (value.startsWith('"')) {
    throw new Error(
      `Cannot read a C-quoted path from the diff: ${value}. ` +
        "Run git with core.quotePath=false, or rename the file.",
    );
  }
  if (!value.startsWith("b/")) {
    throw new Error(
      `Expected a b/ prefixed destination path in the diff, got: ${value}`,
    );
  }
  return value.slice(2);
}

/** Builds a TouchedFile covering every line of a file, for untracked additions. */
export function wholeFile(path: string, lineCount: number): TouchedFile {
  const lines: number[] = [];
  for (let line = 1; line <= lineCount; line++) lines.push(line);
  return { path, lines };
}
