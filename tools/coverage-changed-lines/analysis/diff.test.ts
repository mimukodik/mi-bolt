import { describe, expect, it } from "vitest";

import { parseUnifiedDiff, wholeFile } from "./diff";

/** Builds diff text without leading indentation getting in the way. */
function diff(...lines: string[]): string {
  return `${lines.join("\n")}\n`;
}

describe("parseUnifiedDiff", () => {
  it("reads the added lines out of a hunk", () => {
    const parsed = parseUnifiedDiff(
      diff(
        "diff --git a/src/a.ts b/src/a.ts",
        "--- a/src/a.ts",
        "+++ b/src/a.ts",
        "@@ -1,0 +2,3 @@",
        "+one",
        "+two",
        "+three",
      ),
    );

    expect(parsed).toEqual([{ path: "src/a.ts", lines: [2, 3, 4] }]);
  });

  it("treats a hunk with no line count as a single line", () => {
    const parsed = parseUnifiedDiff(
      diff(
        "diff --git a/src/a.ts b/src/a.ts",
        "--- a/src/a.ts",
        "+++ b/src/a.ts",
        "@@ -4 +4 @@",
        "-old",
        "+new",
      ),
    );

    expect(parsed).toEqual([{ path: "src/a.ts", lines: [4] }]);
  });

  it("adds nothing for a hunk that only deletes", () => {
    const parsed = parseUnifiedDiff(
      diff(
        "diff --git a/src/a.ts b/src/a.ts",
        "--- a/src/a.ts",
        "+++ b/src/a.ts",
        "@@ -7,2 +6,0 @@",
        "-gone",
        "-gone too",
      ),
    );

    expect(parsed).toEqual([]);
  });

  it("merges several hunks in one file and sorts the lines", () => {
    const parsed = parseUnifiedDiff(
      diff(
        "diff --git a/src/a.ts b/src/a.ts",
        "--- a/src/a.ts",
        "+++ b/src/a.ts",
        "@@ -20,0 +21,2 @@",
        "+late",
        "+later",
        "@@ -1,0 +2 @@",
        "+early",
      ),
    );

    expect(parsed).toEqual([{ path: "src/a.ts", lines: [2, 21, 22] }]);
  });

  it("sorts files by path", () => {
    const parsed = parseUnifiedDiff(
      diff(
        "diff --git a/z.ts b/z.ts",
        "--- a/z.ts",
        "+++ b/z.ts",
        "@@ -0,0 +1 @@",
        "+z",
        "diff --git a/a.ts b/a.ts",
        "--- a/a.ts",
        "+++ b/a.ts",
        "@@ -0,0 +1 @@",
        "+a",
      ),
    );

    expect(parsed.map((file) => file.path)).toEqual(["a.ts", "z.ts"]);
  });

  it("skips a deleted file, whose destination is /dev/null", () => {
    const parsed = parseUnifiedDiff(
      diff(
        "diff --git a/src/gone.ts b/src/gone.ts",
        "deleted file mode 100644",
        "--- a/src/gone.ts",
        "+++ /dev/null",
        "@@ -1,2 +0,0 @@",
        "-one",
        "-two",
      ),
    );

    expect(parsed).toEqual([]);
  });

  it("skips a binary file, which has no hunks at all", () => {
    const parsed = parseUnifiedDiff(
      diff(
        "diff --git a/shot.png b/shot.png",
        "new file mode 100644",
        "Binary files /dev/null and b/shot.png differ",
      ),
    );

    expect(parsed).toEqual([]);
  });

  it("counts nothing for a pure rename, which -M reports without hunks", () => {
    const parsed = parseUnifiedDiff(
      diff(
        "diff --git a/src/old.ts b/src/new.ts",
        "similarity index 100%",
        "rename from src/old.ts",
        "rename to src/new.ts",
      ),
    );

    expect(parsed).toEqual([]);
  });

  it("counts only the changed lines of a renamed and edited file", () => {
    const parsed = parseUnifiedDiff(
      diff(
        "diff --git a/src/old.ts b/src/new.ts",
        "similarity index 92%",
        "rename from src/old.ts",
        "rename to src/new.ts",
        "--- a/src/old.ts",
        "+++ b/src/new.ts",
        "@@ -3 +3 @@",
        "-const value = 1;",
        "+const value = 2;",
      ),
    );

    expect(parsed).toEqual([{ path: "src/new.ts", lines: [3] }]);
  });

  it("does not mistake hunk content for a file header", () => {
    // An added line reading `++ b/decoy.ts` renders as `+++ b/decoy.ts`, and a
    // deleted `-- a/decoy.ts` renders as `--- a/decoy.ts`.
    const parsed = parseUnifiedDiff(
      diff(
        "diff --git a/src/a.ts b/src/a.ts",
        "--- a/src/a.ts",
        "+++ b/src/a.ts",
        "@@ -1 +1,3 @@",
        "--- a/decoy.ts",
        "+++ b/decoy.ts",
        "+real line",
        "+another",
      ),
    );

    expect(parsed).toEqual([{ path: "src/a.ts", lines: [1, 2, 3] }]);
  });

  it("starts a fresh file at every diff --git header", () => {
    const parsed = parseUnifiedDiff(
      diff(
        "diff --git a/src/a.ts b/src/a.ts",
        "--- a/src/a.ts",
        "+++ b/src/a.ts",
        "@@ -0,0 +1 @@",
        "+a",
        "diff --git a/note.png b/note.png",
        "Binary files a/note.png and b/note.png differ",
        "@@ -0,0 +9 @@",
      ),
    );

    expect(parsed).toEqual([{ path: "src/a.ts", lines: [1] }]);
  });

  it("refuses a C-quoted path rather than guessing at the escapes", () => {
    expect(() =>
      parseUnifiedDiff(
        diff(
          "diff --git a/x b/x",
          "--- a/x",
          '+++ "b/caf\\303\\251.ts"',
          "@@ -0,0 +1 @@",
          "+x",
        ),
      ),
    ).toThrow(/C-quoted path/);
  });

  it("refuses a destination without the pinned b/ prefix", () => {
    expect(() =>
      parseUnifiedDiff(
        diff(
          "diff --git src/a.ts src/a.ts",
          "--- src/a.ts",
          "+++ src/a.ts",
          "@@ -0,0 +1 @@",
          "+x",
        ),
      ),
    ).toThrow(/b\/ prefixed destination path/);
  });

  it("ignores hunks that appear before any file header", () => {
    expect(parseUnifiedDiff(diff("@@ -0,0 +1,3 @@", "+stray"))).toEqual([]);
  });
});

describe("wholeFile", () => {
  it("lists every line of a new file", () => {
    expect(wholeFile("src/new.ts", 3)).toEqual({
      path: "src/new.ts",
      lines: [1, 2, 3],
    });
  });

  it("lists nothing for an empty file", () => {
    expect(wholeFile("src/empty.ts", 0)).toEqual({
      path: "src/empty.ts",
      lines: [],
    });
  });
});
