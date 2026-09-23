/**
 * Topic names and topic file bodies. Pure.
 *
 * A topic name is the only argument that becomes a path segment, so it is
 * validated against a pattern that cannot express a traversal, an absolute
 * path, a hidden file or a name the index cannot link to. Every command that
 * takes a topic runs that check while parsing argv, before the io layer ever
 * sees the string.
 */

/** The one pattern a topic name has to match. */
export const TOPIC_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** The same rule in words, so a rejection says what would have been accepted. */
export const TOPIC_RULE =
  "a topic name must match ^[a-z0-9][a-z0-9-]{0,63}$, so lowercase letters, " +
  "digits and hyphens only, starting with a letter or a digit, 64 characters " +
  "at most";

/** Whether a string is usable as both a file name and an index link target. */
export function isTopicName(value: string): boolean {
  return TOPIC_PATTERN.test(value);
}

/**
 * Renders a topic file: its own heading, the date it was last recorded, the
 * body, exactly one trailing newline. The heading is generated rather than
 * expected in the content, so every topic file opens by naming the topic
 * even when the writer forgot. `recorded` is a last-written date, not a
 * created date: rewriting a topic updates it to the new date.
 */
export function renderTopicFile(
  topic: string,
  content: string,
  recorded: string,
): string {
  const body = content.trim();
  const header = `# ${topic}\nRecorded: ${recorded}\n`;
  return body === "" ? header : `${header}\n${body}\n`;
}

/** The line a topic file's last-recorded date lives on. */
const RECORDED_LINE = /^Recorded: (\d{4}-\d{2}-\d{2})$/m;

/**
 * The date a topic file was last recorded, or undefined when the file
 * predates the `Recorded:` line and carries none. A date on its own is not a
 * deletion signal, only evidence for a human deciding whether an entry is
 * still trustworthy.
 */
export function extractRecordedDate(text: string): string | undefined {
  return RECORDED_LINE.exec(text)?.[1];
}

/**
 * The message `read` and `remove` print for a topic that is not there.
 *
 * It lists the known topics because the caller is an agent that has only the
 * index in context: a typo or a stale link should cost one command, not a
 * guessing round.
 */
export function formatUnknownTopic(
  topic: string,
  knownTopics: readonly string[],
): string {
  const list =
    knownTopics.length === 0
      ? "  (none yet)"
      : knownTopics.map((name) => `  ${name}`).join("\n");
  return `No such topic: ${topic}.\nKnown topics:\n${list}`;
}
