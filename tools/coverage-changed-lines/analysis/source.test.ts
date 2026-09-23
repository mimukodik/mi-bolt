import { describe, expect, it } from "vitest";

import { linesWithCode } from "./source";

describe("linesWithCode", () => {
  it("marks a blank line as having no code", () => {
    const hasCode = linesWithCode(
      ["const a = 1;", "", "const b = 2;"].join("\n"),
    );

    expect(hasCode[2]).toBe(false);
  });

  it("marks a // line as having no code", () => {
    const hasCode = linesWithCode(
      ["const a = 1;", "// explains b", "const b = 2;"].join("\n"),
    );

    expect(hasCode[2]).toBe(false);
  });

  it("marks every line of a /* */ block as having no code", () => {
    const hasCode = linesWithCode(
      ["const a = 1;", "/* block", " * comment", " */", "const b = 2;"].join(
        "\n",
      ),
    );

    expect(hasCode[2]).toBe(false);
    expect(hasCode[3]).toBe(false);
    expect(hasCode[4]).toBe(false);
  });

  it("marks every line of a JSDoc /** */ block as having no code", () => {
    const hasCode = linesWithCode(
      [
        "const a = 1;",
        "/**",
        " * Does the thing.",
        " * @param x thing",
        " */",
        "const b = 2;",
      ].join("\n"),
    );

    expect(hasCode[2]).toBe(false);
    expect(hasCode[3]).toBe(false);
    expect(hasCode[4]).toBe(false);
    expect(hasCode[5]).toBe(false);
  });

  it("marks a real statement as having code", () => {
    const hasCode = linesWithCode("doThing();");

    expect(hasCode[1]).toBe(true);
  });

  it("marks code with a trailing comment as having code", () => {
    const hasCode = linesWithCode("const x = 1; // note");

    expect(hasCode[1]).toBe(true);
  });

  it("does not mistake a * continuation of arithmetic for a comment", () => {
    const hasCode = linesWithCode(
      ["const area =", "  width", "  * height;"].join("\n"),
    );

    expect(hasCode[3]).toBe(true);
  });

  it("does not mistake a * continuation of JSX for a comment", () => {
    const hasCode = linesWithCode(
      ["const el =", "  cond", "  ? <A />", "  : <B />;"].join("\n"),
    );

    expect(hasCode[3]).toBe(true);
    expect(hasCode[4]).toBe(true);
  });

  it("does not let // inside a string start a comment", () => {
    const hasCode = linesWithCode('const url = "http://example.com";');

    expect(hasCode[1]).toBe(true);
  });

  it("does not let a /* look-alike inside a string swallow the next line", () => {
    const hasCode = linesWithCode(
      ['const note = "here is /* unterminated";', "doThing();"].join("\n"),
    );

    expect(hasCode[1]).toBe(true);
    expect(hasCode[2]).toBe(true);
  });

  it("does not let a // look-alike inside a template literal swallow the next line", () => {
    const hasCode = linesWithCode(
      ["const note = `here is /* also unterminated`;", "doThing();"].join("\n"),
    );

    expect(hasCode[1]).toBe(true);
    expect(hasCode[2]).toBe(true);
  });

  it("recognizes a single-quoted string as code", () => {
    const hasCode = linesWithCode("const s = 'hello';");

    expect(hasCode[1]).toBe(true);
  });

  it("does not end a double-quoted string on an escaped quote", () => {
    const hasCode = linesWithCode('const s = "he said \\"hi\\"";');

    expect(hasCode[1]).toBe(true);
  });

  it("does not end a template literal on an escaped backtick", () => {
    const hasCode = linesWithCode("const s = `it\\`s fine`;");

    expect(hasCode[1]).toBe(true);
  });

  it("does not let a / inside a regex character class start a block comment", () => {
    const hasCode = linesWithCode(
      ["const re = /[/*]/;", "doThing();", "doMore();"].join("\n"),
    );

    expect(hasCode[1]).toBe(true);
    expect(hasCode[2]).toBe(true);
    expect(hasCode[3]).toBe(true);
  });

  it("still opens a block comment where a regex literal could have started", () => {
    const hasCode = linesWithCode(
      [
        "const x = /* opens here",
        " * still comment",
        " */ 1;",
        "doThing();",
      ].join("\n"),
    );

    expect(hasCode[2]).toBe(false);
    expect(hasCode[3]).toBe(true);
    expect(hasCode[4]).toBe(true);
  });

  it("treats a / after an identifier as division, so a block comment still opens", () => {
    const hasCode = linesWithCode(
      ["const half = total / 2; /* trailing", "comment */", "doThing();"].join(
        "\n",
      ),
    );

    expect(hasCode[2]).toBe(false);
    expect(hasCode[3]).toBe(true);
  });

  it.each([
    ["a call", "const value = compute(a) / 2; /* trailing"],
    ["an index", "const value = sizes[key] / 2; /* trailing"],
    ["an object literal end", "const value = { a: 1 } / 2; /* trailing"],
  ])("treats a / after %s as division", (_label, firstLine) => {
    const hasCode = linesWithCode(
      [firstLine, "comment */", "doThing();"].join("\n"),
    );

    expect(hasCode[2]).toBe(false);
    expect(hasCode[3]).toBe(true);
  });

  it("opens a regex literal after a keyword", () => {
    const hasCode = linesWithCode(
      [
        "function has(value) {",
        "  return /[/*]/.test(value);",
        "}",
        "const after = 1;",
      ].join("\n"),
    );

    expect(hasCode[3]).toBe(true);
    expect(hasCode[4]).toBe(true);
  });

  it("opens a regex literal at the start of a file", () => {
    const hasCode = linesWithCode(
      ["/[/*]/.test(input);", "doThing();"].join("\n"),
    );

    expect(hasCode[2]).toBe(true);
  });

  it("does not end a regex literal on an escaped /", () => {
    const hasCode = linesWithCode(
      ["const re = /\\/[/*]/;", "doThing();"].join("\n"),
    );

    expect(hasCode[2]).toBe(true);
  });

  it("does not end a regex literal on a / inside a character class", () => {
    const hasCode = linesWithCode(
      ["const re = /[/']/;", "// note", "doThing();"].join("\n"),
    );

    expect(hasCode[2]).toBe(false);
    expect(hasCode[3]).toBe(true);
  });

  it("ends a regex character class at ]", () => {
    const hasCode = linesWithCode(
      ["const re = /[abc]/ /* trailing", "comment */", "doThing();"].join("\n"),
    );

    expect(hasCode[2]).toBe(false);
    expect(hasCode[3]).toBe(true);
  });

  it("starts each regex literal outside a character class", () => {
    const hasCode = linesWithCode(
      [
        "const bad = /[abc",
        "const re = /a/ /* trailing",
        "comment */",
        "doThing();",
      ].join("\n"),
    );

    expect(hasCode[3]).toBe(false);
    expect(hasCode[4]).toBe(true);
  });

  it("returns to code at the newline when a division was read as a regex", () => {
    const hasCode = linesWithCode(
      ["const next = index++ / 2;", "// note", "doThing();"].join("\n"),
    );

    expect(hasCode[1]).toBe(true);
    expect(hasCode[2]).toBe(false);
    expect(hasCode[3]).toBe(true);
  });

  it("separates two words on the whitespace between them", () => {
    const hasCode = linesWithCode(
      [
        "function pick(a, b) {",
        "  if (a) doThing();",
        "  else return /[/*]/.test(b);",
        "}",
        "const after = 1;",
      ].join("\n"),
    );

    expect(hasCode[5]).toBe(true);
  });

  it("starts a fresh token at the start of a line", () => {
    const hasCode = linesWithCode(
      [
        "function has(value, flag) {",
        "const ready = flag",
        "return /[/*]/.test(value) && ready;",
        "}",
        "const after = 1;",
      ].join("\n"),
    );

    expect(hasCode[5]).toBe(true);
  });

  it("reports no code for a file with no coverable content at all", () => {
    const hasCode = linesWithCode(
      ["// header", "", "/* trailing */"].join("\n"),
    );

    expect(hasCode[1]).toBe(false);
    expect(hasCode[2]).toBe(false);
    expect(hasCode[3]).toBe(false);
  });
});
