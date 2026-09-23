import { describe, expect, it } from "vitest";

import {
  extractReviewedStamp,
  INDEX_HEADER,
  INDEX_MAX_BYTES,
  INDEX_MAX_LINES,
  INDEX_PATH,
  indexSize,
  indexTooLargeProblem,
  parseIndex,
  pluralizeEntries,
  renderEntryLine,
  renderIndex,
  renderReviewedLine,
  SUMMARY_MAX_LENGTH,
  summaryProblem,
  withEntry,
  withoutEntry,
  withReviewedStamp,
} from "./index";

const INDEX = `# Shared memory index

Prose that stays.

<!-- entries below, one line each: - [<topic>](<topic>.md): summary -->

- [porta](porta.md): why delegation goes through a named workflow
- [vitest](vitest.md): where the root suite lives
`;

describe("parseIndex", () => {
  it("splits the prose from the entries", () => {
    const index = parseIndex(INDEX);

    expect(index.entries).toEqual([
      {
        topic: "porta",
        summary: "why delegation goes through a named workflow",
      },
      { topic: "vitest", summary: "where the root suite lives" },
    ]);
    expect(index.preamble.join("\n")).toContain("Prose that stays.");
  });

  it("leaves the format comment alone, entry-shaped as its text is", () => {
    expect(parseIndex(INDEX).preamble).toContain(
      "<!-- entries below, one line each: - [<topic>](<topic>.md): summary -->",
    );
  });

  it("finds no entry in the committed header", () => {
    expect(parseIndex(INDEX_HEADER).entries).toEqual([]);
  });

  it.each([
    ["- [porta](other.md): link and target disagree"],
    ["- [Porta](Porta.md): not a topic name"],
    ["- [porta](porta.md):"],
    ["  - [porta](porta.md): indented"],
  ])("keeps %s as prose rather than reading it as an entry", (line) => {
    const index = parseIndex(line);

    expect(index.entries).toEqual([]);
    expect(index.preamble).toContain(line);
  });
});

describe("renderIndex", () => {
  it("round-trips an index it parsed", () => {
    expect(renderIndex(parseIndex(INDEX))).toBe(INDEX);
  });

  it("sorts the entries by topic and ends with one newline", () => {
    const index = parseIndex("# Head\n");

    const rendered = renderIndex(
      withEntry(withEntry(index, { topic: "vitest", summary: "second" }), {
        topic: "porta",
        summary: "first",
      }),
    );

    expect(rendered).toBe(
      "# Head\n\n- [porta](porta.md): first\n- [vitest](vitest.md): second\n",
    );
  });

  it("keeps the prose alone when there are no entries", () => {
    expect(renderIndex(parseIndex("# Head\n\n\n"))).toBe("# Head\n");
  });
});

describe("withEntry", () => {
  it("replaces the summary a topic already had", () => {
    const index = withEntry(parseIndex(INDEX), {
      topic: "porta",
      summary: "rewritten",
    });

    expect(index.entries.filter((entry) => entry.topic === "porta")).toEqual([
      { topic: "porta", summary: "rewritten" },
    ]);
    expect(index.entries).toHaveLength(2);
  });
});

describe("withoutEntry", () => {
  it("drops one topic and leaves the rest", () => {
    expect(withoutEntry(parseIndex(INDEX), "porta").entries).toEqual([
      { topic: "vitest", summary: "where the root suite lives" },
    ]);
  });

  it("changes nothing for a topic with no entry", () => {
    expect(withoutEntry(parseIndex(INDEX), "absent").entries).toHaveLength(2);
  });
});

describe("renderEntryLine", () => {
  it("links the topic to its own file", () => {
    expect(renderEntryLine({ topic: "porta", summary: "why" })).toBe(
      "- [porta](porta.md): why",
    );
  });
});

describe("summaryProblem", () => {
  it("accepts one line within the limit", () => {
    expect(summaryProblem("a".repeat(SUMMARY_MAX_LENGTH))).toBeUndefined();
  });

  it("rejects an empty summary", () => {
    expect(summaryProblem("  ")).toBe("A summary must not be empty.");
  });

  it("rejects a multi-line summary", () => {
    expect(summaryProblem("first\nsecond")).toContain("must be a single line");
  });

  it("names the limit and the length when it is too long", () => {
    expect(summaryProblem("a".repeat(SUMMARY_MAX_LENGTH + 1))).toBe(
      `A summary must be at most ${SUMMARY_MAX_LENGTH} characters; this one is ${SUMMARY_MAX_LENGTH + 1}.`,
    );
  });
});

describe("indexTooLargeProblem", () => {
  it("accepts an index at exactly the line cap", () => {
    const text = `${Array.from({ length: INDEX_MAX_LINES }, () => "x").join("\n")}\n`;

    expect(indexTooLargeProblem(text)).toBeUndefined();
  });

  it("names the line cap and what to do about it", () => {
    const text = `${Array.from({ length: INDEX_MAX_LINES + 1 }, () => "x").join("\n")}\n`;

    const problem = indexTooLargeProblem(text);

    expect(problem).toContain(`${INDEX_MAX_LINES + 1} lines`);
    expect(problem).toContain(`over the ${INDEX_MAX_LINES} line cap`);
    expect(problem).toContain("remove stale ones");
  });

  it("names the byte cap for a short index of very long lines", () => {
    const text = `${Array.from({ length: 100 }, () => "x".repeat(300)).join("\n")}\n`;

    expect(indexTooLargeProblem(text)).toContain(
      `over the ${INDEX_MAX_BYTES} byte cap`,
    );
  });
});

describe("the index location", () => {
  it("is the path the SessionStart hook reads", () => {
    expect(INDEX_PATH).toBe(".claude/shared-memory/MEMORY.md");
  });
});

describe("indexSize", () => {
  it("counts lines the way the hook's slice does, and the byte length", () => {
    expect(indexSize("one\ntwo\n")).toEqual({ lines: 2, bytes: 8 });
  });

  it("counts multi-byte characters by their encoded length, not their count", () => {
    expect(indexSize("é\n")).toEqual({ lines: 1, bytes: 3 });
  });
});

describe("pluralizeEntries", () => {
  it("uses the singular for a count of one", () => {
    expect(pluralizeEntries(1)).toBe("1 entry");
  });

  it("uses the plural for a count above one", () => {
    expect(pluralizeEntries(3)).toBe("3 entries");
  });

  it("uses the plural for a count of zero", () => {
    expect(pluralizeEntries(0)).toBe("0 entries");
  });
});

describe("renderReviewedLine", () => {
  it("renders the date and a plural entry count", () => {
    expect(renderReviewedLine({ date: "2026-02-01", entries: 3 })).toBe(
      "Reviewed: 2026-02-01 (3 entries)",
    );
  });

  it("renders the date and a singular entry count", () => {
    expect(renderReviewedLine({ date: "2026-02-01", entries: 1 })).toBe(
      "Reviewed: 2026-02-01 (1 entry)",
    );
  });
});

describe("extractReviewedStamp", () => {
  it("finds no stamp when the index has never been reviewed", () => {
    expect(extractReviewedStamp(parseIndex(INDEX))).toBeUndefined();
  });

  it("reads the date and entry count from the preamble", () => {
    const text = "# Shared memory index\nReviewed: 2026-02-01 (3 entries)\n";

    expect(extractReviewedStamp(parseIndex(text))).toEqual({
      date: "2026-02-01",
      entries: 3,
    });
  });

  it("still reads a stamp written with the old ungrammatical singular", () => {
    const text = "# Shared memory index\nReviewed: 2026-01-01 (1 entries)\n";

    expect(extractReviewedStamp(parseIndex(text))).toEqual({
      date: "2026-01-01",
      entries: 1,
    });
  });
});

describe("withReviewedStamp", () => {
  it("inserts the line directly under the heading when there is none yet", () => {
    const index = withReviewedStamp(parseIndex(INDEX_HEADER), {
      date: "2026-02-01",
      entries: 0,
    });

    expect(index.preamble[0]).toBe("# Shared memory index");
    expect(index.preamble[1]).toBe("Reviewed: 2026-02-01 (0 entries)");
  });

  it("replaces the existing stamp in place, leaving the rest untouched", () => {
    const text =
      "# Shared memory index\nReviewed: 2026-01-01 (1 entries)\n\nProse.\n";

    const index = withReviewedStamp(parseIndex(text), {
      date: "2026-02-01",
      entries: 3,
    });

    expect(index.preamble).toEqual([
      "# Shared memory index",
      "Reviewed: 2026-02-01 (3 entries)",
      "",
      "Prose.",
      "",
    ]);
  });

  it("leaves every entry untouched", () => {
    const index = withReviewedStamp(parseIndex(INDEX), {
      date: "2026-02-01",
      entries: 2,
    });

    expect(index.entries).toEqual(parseIndex(INDEX).entries);
  });

  it("prepends the stamp when the preamble carries no heading at all", () => {
    const index = withReviewedStamp(parseIndex("Prose with no heading.\n"), {
      date: "2026-02-01",
      entries: 0,
    });

    expect(index.preamble[0]).toBe("Reviewed: 2026-02-01 (0 entries)");
  });
});
