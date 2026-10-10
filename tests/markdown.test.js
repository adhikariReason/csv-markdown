import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toMarkdown, parseMarkdown, escapeCell, unescapeCell, displayWidth, MD_ERRORS,
} from "../src/markdown.js";

const mdRows = (t) => { const r = parseMarkdown(t); assert.ok(r.ok, r.reason); return r.rows; };

test("a plain table renders with a separator row", () => {
  assert.equal(toMarkdown([["a", "b"], ["1", "2"]]),
    "| a | b |\n| --- | --- |\n| 1 | 2 |");
});

test("aligned output pads every column to its widest cell", () => {
  const out = toMarkdown([["name", "x"], ["longer", "y"]], { align: true });
  const lines = out.split("\n");
  assert.equal(lines[0], "| name   | x   |");
  assert.equal(lines[2], "| longer | y   |");
  assert.equal(new Set(lines.map((l) => l.length)).size, 1, "every line should be the same width");
});

test("a pipe inside a cell is escaped, not left to split the column", () => {
  const out = toMarkdown([["a"], ["x | y"]]);
  assert.match(out, /x \\\| y/);
  assert.deepEqual(mdRows(out), [["a"], ["x | y"]]);
});

test("a newline inside a cell becomes <br> and comes back", () => {
  const out = toMarkdown([["a"], ["one\ntwo"]]);
  assert.match(out, /one<br>two/);
  assert.deepEqual(mdRows(out), [["a"], ["one\ntwo"]]);
});

test("backslashes survive the round trip", () => {
  const cell = "C:\\path\\to";
  assert.deepEqual(mdRows(toMarkdown([["p"], [cell]])), [["p"], [cell]]);
});

test("a cell containing an escaped pipe and a backslash together", () => {
  const cell = "a\\|b";
  assert.deepEqual(mdRows(toMarkdown([["x"], [cell]])), [["x"], [cell]]);
});

test("ragged rows are padded so the table is not broken", () => {
  const out = toMarkdown([["a", "b", "c"], ["1"]]);
  assert.deepEqual(mdRows(out), [["a", "b", "c"], ["1", "", ""]]);
});

test("empty input renders as nothing", () => {
  assert.equal(toMarkdown([]), "");
  assert.equal(toMarkdown(null), "");
});

// --- parsing --------------------------------------------------------------

test("tables without leading and trailing pipes still parse", () => {
  assert.deepEqual(mdRows("a | b\n--- | ---\n1 | 2"), [["a", "b"], ["1", "2"]]);
});

test("alignment colons in the separator are ignored", () => {
  assert.deepEqual(mdRows("| a | b |\n| :-- | --: |\n| 1 | 2 |"), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(mdRows("| a |\n| :-: |\n| 1 |"), [["a"], ["1"]]);
});

test("surrounding prose is ignored, the table is still found", () => {
  const text = "Here is a table:\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\nThanks.";
  assert.deepEqual(mdRows(text), [["a", "b"], ["1", "2"]]);
});

test("cell padding is trimmed on the way in", () => {
  assert.deepEqual(mdRows("|   a   |   b   |\n| --- | --- |\n|  1 |  2  |"), [["a", "b"], ["1", "2"]]);
});

test("input that is not a table is refused", () => {
  assert.equal(parseMarkdown("just some prose").ok, false);
  assert.equal(parseMarkdown("").reason, MD_ERRORS.NOT_A_TABLE);
  assert.equal(parseMarkdown(null).ok, false);
  assert.equal(parseMarkdown("   \n  \n").ok, false);
});

test("a separator-only table is refused rather than returning nothing", () => {
  assert.equal(parseMarkdown("| --- | --- |").ok, false);
});

test("parseMarkdown never throws", () => {
  for (const junk of [null, undefined, 0, NaN, true, {}, [], () => {}]) {
    assert.doesNotThrow(() => parseMarkdown(junk), String(junk));
  }
});

// --- width ----------------------------------------------------------------

test("display width counts wide characters as two columns", () => {
  assert.equal(displayWidth("abc"), 3);
  assert.equal(displayWidth("日本語"), 6);
  assert.equal(displayWidth("🎉"), 2);
  assert.equal(displayWidth(""), 0);
});

test("combining marks and emoji joiners do not add width", () => {
  assert.equal(displayWidth("e\u0301"), 1);         // e + combining acute
  assert.equal(displayWidth("a\u200db"), 2);
});

test("wide characters align correctly in a rendered table", () => {
  const out = toMarkdown([["name", "x"], ["日本語", "y"]], { align: true });
  const lines = out.split("\n");
  const widths = lines.map((l) => [...l].reduce((w, ch) => w + displayWidth(ch), 0));
  assert.equal(new Set(widths).size, 1, "rows should be visually equal width");
});

test("escape and unescape are inverses", () => {
  for (const cell of ["plain", "a|b", "a\\b", "a\\|b", "x\ny", "mixed \\ | \n end", ""]) {
    assert.equal(unescapeCell(escapeCell(cell)), cell, `failed for ${JSON.stringify(cell)}`);
  }
});

test("<br/> and <BR> variants are also read back as newlines", () => {
  assert.equal(unescapeCell("a<br/>b"), "a\nb");
  assert.equal(unescapeCell("a<BR>b"), "a\nb");
});
