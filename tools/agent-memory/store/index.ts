/**
 * The index file: parsing it into entries, editing them, rendering it back,
 * and the size cap that keeps it injectable. Pure: the caller supplies the
 * text.
 *
 * Every line that is not an entry is preamble, and entries always render at
 * the bottom in topic order. That is what lets the committed prose at the top
 * of MEMORY.md be edited by hand without this tool having to understand it.
 */

/** Repo-relative directory holding the index and the topic files. */
export const MEMORY_DIRECTORY = ".claude/shared-memory";

/** The index file's name inside that directory. */
export const INDEX_FILE_NAME = "MEMORY.md";

/** Repo-relative path of the index, as the output prints it. */
export const INDEX_PATH = `${MEMORY_DIRECTORY}/${INDEX_FILE_NAME}`;

/** One line of the index: a topic and the summary that decides who reads it. */
export interface IndexEntry {
  readonly topic: string;
  readonly summary: string;
}

/** An index split into the prose it opens with and the entries it carries. */
export interface MemoryIndex {
  readonly preamble: readonly string[];
  readonly entries: readonly IndexEntry[];
}

/**
 * An entry line, with the link target pinned to the topic by a backreference
 * so a hand-edited line whose text and target disagree is left as preamble
 * rather than silently rewritten.
 */
const ENTRY_LINE = /^- \[([a-z0-9][a-z0-9-]*)\]\(\1\.md\): (.+)$/;

/**
 * The header a new index starts from.
 *
 * Only used when the committed index is missing, which means someone deleted
 * it: the real file carries its own prose, and parsing keeps whatever it
 * says.
 */
export const INDEX_HEADER = `# Shared memory index

Durable learnings for this workspace, one line per topic. Written by
\`pnpm claude:memory write\`, read on demand with \`pnpm claude:memory read\`.

<!-- entries below, one line each: - [<topic>](<topic>.md): summary -->
`;

/** A summary is one line, so the index stays one line per entry. */
export const SUMMARY_MAX_LENGTH = 120;

/**
 * The cap the SessionStart hook applies when it injects the index: the first
 * 200 lines or 25KB, whichever comes first. Refusing to write past it here is
 * what stops this tool producing an index the hook would silently truncate.
 */
export const INDEX_MAX_LINES = 200;
export const INDEX_MAX_BYTES = 25 * 1024;

/** Renders one entry line. */
export function renderEntryLine(entry: IndexEntry): string {
  return `- [${entry.topic}](${entry.topic}.md): ${entry.summary}`;
}

/** Splits an index into its preamble lines and its entries. */
export function parseIndex(text: string): MemoryIndex {
  const preamble: string[] = [];
  const entries: IndexEntry[] = [];

  for (const line of text.split("\n")) {
    const match = ENTRY_LINE.exec(line);
    const topic = match?.[1];
    const summary = match?.[2];
    if (topic !== undefined && summary !== undefined) {
      entries.push({ topic, summary });
    } else {
      preamble.push(line);
    }
  }

  return { preamble, entries };
}

/**
 * Renders an index back to text: the preamble, then the entries sorted by
 * topic, then exactly one trailing newline. Sorting happens here so every
 * path that writes the file produces the same order.
 */
export function renderIndex(index: MemoryIndex): string {
  const lines = [...index.preamble];
  while (lines.at(-1)?.trim() === "") lines.pop();

  const sorted = [...index.entries].sort((left, right) =>
    left.topic < right.topic ? -1 : left.topic > right.topic ? 1 : 0,
  );
  if (sorted.length > 0) lines.push("", ...sorted.map(renderEntryLine));

  return `${lines.join("\n")}\n`;
}

/** Inserts an entry, replacing any entry the topic already had. */
export function withEntry(index: MemoryIndex, entry: IndexEntry): MemoryIndex {
  return {
    preamble: index.preamble,
    entries: [
      ...index.entries.filter((existing) => existing.topic !== entry.topic),
      entry,
    ],
  };
}

/** Drops a topic's entry, if it has one. */
export function withoutEntry(index: MemoryIndex, topic: string): MemoryIndex {
  return {
    preamble: index.preamble,
    entries: index.entries.filter((entry) => entry.topic !== topic),
  };
}

/** Why a summary cannot become an entry line, or undefined when it can. */
export function summaryProblem(summary: string): string | undefined {
  if (summary.trim() === "") return "A summary must not be empty.";
  if (/[\n\r]/.test(summary)) {
    return "A summary must be a single line; move the detail into --content.";
  }
  if (summary.length > SUMMARY_MAX_LENGTH) {
    return `A summary must be at most ${SUMMARY_MAX_LENGTH} characters; this one is ${summary.length}.`;
  }
  return undefined;
}

/**
 * Counts the lines of a file the way the hook's slice does, so a file ending
 * in a newline is not counted as carrying one more line than it has.
 */
function countLines(text: string): number {
  const parts = text.split("\n");
  return parts.at(-1) === "" ? parts.length - 1 : parts.length;
}

/** An index's size, measured the way the SessionStart hook's cap measures it. */
export interface IndexSize {
  readonly lines: number;
  readonly bytes: number;
}

/** The index's current size against the hook's injection cap. */
export function indexSize(text: string): IndexSize {
  return {
    lines: countLines(text),
    bytes: new TextEncoder().encode(text).length,
  };
}

/** Why an index may not be written, or undefined when it is within the cap. */
export function indexTooLargeProblem(text: string): string | undefined {
  const { lines, bytes } = indexSize(text);
  if (lines <= INDEX_MAX_LINES && bytes <= INDEX_MAX_BYTES) return undefined;

  const measured =
    lines > INDEX_MAX_LINES
      ? `${lines} lines, over the ${INDEX_MAX_LINES} line cap`
      : `${bytes} bytes, over the ${INDEX_MAX_BYTES} byte cap`;
  return (
    `Refusing to write: the index would be ${measured}. The SessionStart hook ` +
    `injects only the first ${INDEX_MAX_LINES} lines or ${INDEX_MAX_BYTES} ` +
    `bytes, so anything past that would be dropped from every session without ` +
    `a word. Shorten the summaries, merge related topics, or remove stale ones.`
  );
}

/**
 * The index's `Reviewed:` preamble line: the date a review last ran, and the
 * entry count at that moment. Absent means no review has ever run.
 */
export interface ReviewedStamp {
  readonly date: string;
  readonly entries: number;
}

/**
 * The line format itself, matched against one preamble line at a time rather
 * than the whole text, so it is found regardless of where the caller's
 * preamble puts it. Accepts both `entry` and `entries` so a stamp written
 * before singular entries were pluralized correctly still parses.
 */
const REVIEWED_LINE = /^Reviewed: (\d{4}-\d{2}-\d{2}) \((\d+) entr(?:y|ies)\)$/;

/** Renders a count of entries with correct pluralization: "1 entry", "2 entries". */
export function pluralizeEntries(count: number): string {
  return `${count} ${count === 1 ? "entry" : "entries"}`;
}

/** Renders the `Reviewed:` preamble line for one stamp. */
export function renderReviewedLine(stamp: ReviewedStamp): string {
  return `Reviewed: ${stamp.date} (${pluralizeEntries(stamp.entries)})`;
}

/** The index's `Reviewed:` stamp, or undefined when no review has ever run. */
export function extractReviewedStamp(
  index: MemoryIndex,
): ReviewedStamp | undefined {
  for (const line of index.preamble) {
    const match = REVIEWED_LINE.exec(line);
    const date = match?.[1];
    const entries = match?.[2];
    if (date !== undefined && entries !== undefined) {
      return { date, entries: Number(entries) };
    }
  }
  return undefined;
}

/**
 * Inserts the `Reviewed:` line directly under the heading, or replaces it in
 * place when one is already there. Every other preamble line and every entry
 * is left exactly as it was.
 */
export function withReviewedStamp(
  index: MemoryIndex,
  stamp: ReviewedStamp,
): MemoryIndex {
  const line = renderReviewedLine(stamp);
  const preamble = [...index.preamble];
  const existingIndex = preamble.findIndex((candidate) =>
    REVIEWED_LINE.test(candidate),
  );
  if (existingIndex !== -1) {
    preamble[existingIndex] = line;
  } else {
    const headingIndex = preamble.findIndex((candidate) =>
      candidate.startsWith("# "),
    );
    preamble.splice(headingIndex === -1 ? 0 : headingIndex + 1, 0, line);
  }
  return { preamble, entries: index.entries };
}
