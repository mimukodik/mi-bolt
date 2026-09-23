import { describe, expect, it } from "vitest";

import {
  extractRecordedDate,
  formatUnknownTopic,
  isTopicName,
  renderTopicFile,
  TOPIC_RULE,
} from "./topic";

describe("isTopicName", () => {
  it.each(["a", "9", "porta-workflows", "a".repeat(64)])(
    "accepts %s",
    (topic) => {
      expect(isTopicName(topic)).toBe(true);
    },
  );

  it.each([
    ["", "empty"],
    ["-leading", "a leading hyphen"],
    ["Upper", "an uppercase letter"],
    ["with space", "a space"],
    ["with_underscore", "an underscore"],
    ["../escape", "a traversal"],
    ["nested/topic", "a separator"],
    [".hidden", "a dot"],
    ["a".repeat(65), "65 characters"],
    ["topic\n", "a newline"],
  ])("rejects %s, which has %s", (topic) => {
    expect(isTopicName(topic)).toBe(false);
  });

  it("states the pattern it enforces", () => {
    expect(TOPIC_RULE).toContain("^[a-z0-9][a-z0-9-]{0,63}$");
  });
});

describe("renderTopicFile", () => {
  it("puts the topic and the recorded date in a heading above the body", () => {
    expect(
      renderTopicFile("porta", "One thing.\nAnother.", "2026-01-15"),
    ).toBe("# porta\nRecorded: 2026-01-15\n\nOne thing.\nAnother.\n");
  });

  it("ends with exactly one newline whatever the body ends with", () => {
    expect(renderTopicFile("porta", "Body.\n\n\n", "2026-01-15")).toBe(
      "# porta\nRecorded: 2026-01-15\n\nBody.\n",
    );
  });

  it("writes the heading and date alone for an empty body", () => {
    expect(renderTopicFile("porta", "   ", "2026-01-15")).toBe(
      "# porta\nRecorded: 2026-01-15\n",
    );
  });

  it("updates the recorded date when a topic is rewritten", () => {
    expect(renderTopicFile("porta", "Body.", "2026-02-01")).toBe(
      "# porta\nRecorded: 2026-02-01\n\nBody.\n",
    );
  });
});

describe("extractRecordedDate", () => {
  it("reads the recorded date out of a topic file", () => {
    expect(
      extractRecordedDate("# porta\nRecorded: 2026-01-15\n\nBody.\n"),
    ).toBe("2026-01-15");
  });

  it("reports undefined for a file that predates the Recorded line", () => {
    expect(extractRecordedDate("# porta\n\nBody.\n")).toBeUndefined();
  });
});

describe("formatUnknownTopic", () => {
  it("lists the topics that do exist", () => {
    expect(formatUnknownTopic("prota", ["porta", "vitest"])).toBe(
      "No such topic: prota.\nKnown topics:\n  porta\n  vitest",
    );
  });

  it("says so when there are none", () => {
    expect(formatUnknownTopic("porta", [])).toBe(
      "No such topic: porta.\nKnown topics:\n  (none yet)",
    );
  });
});
