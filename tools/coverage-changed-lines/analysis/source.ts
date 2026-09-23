/**
 * Classifies each line of a source file as carrying executable code or not,
 * by one lexical scan that tracks string, template literal, regex literal and
 * comment state.
 *
 * `coverage.ts` answers a line's status by inheriting the count of the
 * smallest statement span that contains it. A comment or blank line inside an
 * untested block is contained by that block's own statement, so it inherits
 * the block's zero count and reads as uncovered even though it has no code a
 * test could execute. This module tells the gate which touched lines are
 * blank or comment-only, so those inherited counts can be skipped instead of
 * reported.
 *
 * A prefix test on the trimmed line cannot do this safely: a continuation
 * line of an arithmetic or JSX expression can start with `*` (as in
 * `width\n  * height`), and a string or template literal can contain `//` or
 * `/*`. Scanning the file's actual lexical state tells those apart from a
 * real comment, because the check for a comment start only fires while the
 * scan is not already inside a string or template literal.
 *
 * This is not a full parser. Whether a `/` opens a regex literal or divides is
 * decided from the previous significant token, and nested template
 * interpolations (`` `${`nested`}` ``) are still not tracked. Reading a
 * division as a regex is the harmless direction: a regex literal cannot span a
 * line, so the scan returns to code at the newline and those lines stay marked
 * as code, which at worst costs the gate a line it need not have checked.
 * Reading a regex as a division is the direction that can hide a line, and it
 * takes a regex opening directly after `)`, `]`, `}` or an identifier that
 * also carries a `/*` inside it. That shape, and a nested template
 * interpolation, are what the scan can still get wrong in the permissive
 * direction.
 */

type State =
  | "code"
  | "lineComment"
  | "blockComment"
  | "singleQuote"
  | "doubleQuote"
  | "template"
  | "regex";

/** Tokens that end a value, so the `/` after one divides. */
const VALUE_ENDINGS = new Set([")", "]", "}"]);

/** Words a regex literal may follow; any other word is a value that divides. */
const REGEX_PRECEDING_KEYWORDS = new Set([
  "await",
  "case",
  "delete",
  "do",
  "else",
  "in",
  "instanceof",
  "new",
  "of",
  "return",
  "throw",
  "typeof",
  "void",
  "yield",
]);

/** Whether a character belongs to an identifier, a number or a keyword. */
function isWordCharacter(character: string): boolean {
  return /[A-Za-z0-9_$]/.test(character);
}

/**
 * Whether a `/` in code state opens a regex literal rather than dividing.
 *
 * `lastToken` is the previous significant token of the code itself: a whole
 * word, or the single character of a punctuator. A word divides unless it is
 * one of the keywords a regex may follow, `)`, `]` and `}` divide, and
 * everything else, the empty token at the start of a file included, opens a
 * regex. String, template and comment content never becomes the token, so a
 * `/` after a closed string reads as a regex; that, and every other case the
 * heuristic has to guess at, lands on the side that keeps the line as code.
 */
function startsRegexLiteral(lastToken: string): boolean {
  if (VALUE_ENDINGS.has(lastToken)) return false;
  if (isWordCharacter(lastToken.charAt(0)))
    return REGEX_PRECEDING_KEYWORDS.has(lastToken);
  return true;
}

/**
 * Returns, for each 1-based line of `source` (index 0 unused), whether the
 * line has any character that is not whitespace and not comment content.
 */
export function linesWithCode(source: string): readonly boolean[] {
  const lineCount = source.split("\n").length;
  const hasCode = new Array<boolean>(lineCount + 1).fill(false);

  let state: State = "code";
  let line = 1;
  let lastToken = "";
  let inWord = false;
  let inCharacterClass = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source.charAt(i);
    const next = source[i + 1];

    if (ch === "\n") {
      line++;
      // A regex literal cannot span a line, so an unterminated one was a
      // division the heuristic misread; ending it here keeps that to one line.
      if (state === "lineComment" || state === "regex") state = "code";
      inWord = false;
      continue;
    }

    if (state === "lineComment") continue;

    if (state === "blockComment") {
      if (ch === "*" && next === "/") {
        i++;
        state = "code";
      }
      continue;
    }

    if (state === "singleQuote" || state === "doubleQuote") {
      hasCode[line] = true;
      if (ch === "\\" && next !== undefined && next !== "\n") {
        i++;
      } else if (
        (state === "singleQuote" && ch === "'") ||
        (state === "doubleQuote" && ch === '"')
      ) {
        state = "code";
      }
      continue;
    }

    if (state === "template") {
      hasCode[line] = true;
      if (ch === "\\" && next !== undefined && next !== "\n") {
        i++;
      } else if (ch === "`") {
        state = "code";
      }
      continue;
    }

    // The opening `/` already marked the line as code, and a regex literal
    // cannot reach the next one, so this state only reads.
    if (state === "regex") {
      if (ch === "\\" && next !== undefined && next !== "\n") {
        i++;
      } else if (inCharacterClass) {
        if (ch === "]") inCharacterClass = false;
      } else if (ch === "[") {
        inCharacterClass = true;
      } else if (ch === "/") {
        state = "code";
      }
      continue;
    }

    // state === "code"
    // Both comment openers are checked before the regex heuristic, because the
    // first character of a regex literal can be neither `/` nor `*`.
    if (ch === "/" && next === "/") {
      state = "lineComment";
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      state = "blockComment";
      i++;
      continue;
    }
    if (ch === "/" && startsRegexLiteral(lastToken)) {
      state = "regex";
      inCharacterClass = false;
      hasCode[line] = true;
      continue;
    }
    if (ch === "'") {
      state = "singleQuote";
      hasCode[line] = true;
      continue;
    }
    if (ch === '"') {
      state = "doubleQuote";
      hasCode[line] = true;
      continue;
    }
    if (ch === "`") {
      state = "template";
      hasCode[line] = true;
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\r") {
      inWord = false;
      continue;
    }
    hasCode[line] = true;
    if (isWordCharacter(ch)) {
      lastToken = inWord ? lastToken + ch : ch;
      inWord = true;
    } else {
      lastToken = ch;
      inWord = false;
    }
  }

  return hasCode;
}
