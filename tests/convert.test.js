import { test } from "node:test";
import assert from "node:assert/strict";
import { csvToMarkdown, markdownToCsv, detectFormat } from "../src/convert.js";
import { parseCsv } from "../src/csv.js";

const md = (t, o) => { const r = csvToMarkdown(t, o); assert.ok(r.ok, r.reason); return r.output; };
const csv = (t) => { const r = markdownToCsv(t); assert.ok(r.ok, r.reason); return r.output; };

test("the headline conversion", () => {
  assert.equal(md("name,age\nAda,36", { align: false }),
    "| name | age |\n| --- | --- |\n| Ada | 36 |");
});

test("and back again", () => {
  assert.equal(csv("| name | age |\n| --- | --- |\n| Ada | 36 |"), "name,age\nAda,36");
});

test("the delimiter is sniffed, so TSV just works", () => {
  assert.equal(md("a\tb\n1\t2", { align: false }), "| a | b |\n| --- | --- |\n| 1 | 2 |");
  assert.equal(md("a;b\n1;2", { align: false }), "| a | b |\n| --- | --- |\n| 1 | 2 |");
});

test("a quoted comma does not become a new column", () => {
  const out = md('name,note\n"Doe, Jane",ok', { align: false });
  assert.equal(out, "| name | note |\n| --- | --- |\n| Doe, Jane | ok |");
});

test("a quoted comma survives the trip back to CSV", () => {
  assert.equal(csv(md('name,note\n"Doe, Jane",ok')), 'name,note\n"Doe, Jane",ok');
});

test("an unclosed quote is reported rather than silently mangled", () => {
  const r = csvToMarkdown('a,"oops');
  assert.equal(r.ok, false);
  assert.match(r.reason, /quoted field/i);
});

test("prose instead of a table is refused", () => {
  const r = markdownToCsv("this is not a table");
  assert.equal(r.ok, false);
});

test("empty input converts to empty, not an error", () => {
  const r = csvToMarkdown("");
  assert.equal(r.ok, true);
  assert.equal(r.output, "");
});

// --- the round trip, which is the whole point -----------------------------

const AWKWARD = [
  ["id", "name", "note"],
  ["1", "Doe, Jane", "has a comma"],
  ["2", 'He said "hi"', "has quotes"],
  ["3", "a | b", "has a pipe"],
  ["4", "line one\nline two", "has a newline"],
  ["5", "  padded  ", "significant spaces"],
  ["6", "日本語テキスト", "wide characters"],
  ["7", "emoji 🎉 here", "astral plane"],
  ["8", "C:\\path\\to", "backslashes"],
  ["9", "", "empty cell"],
  ["10", "tab\there", "embedded tab"],
];

test("csv -> markdown -> csv preserves every awkward cell", () => {
  const original = AWKWARD.map((r) => r.map((c) => (/[",\n]/.test(c) || c !== c.trim() ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n");
  const asMarkdown = md(original);
  const back = csv(asMarkdown);
  const reparsed = parseCsv(back);
  assert.ok(reparsed.ok, reparsed.reason);
  assert.deepEqual(reparsed.rows, AWKWARD);
});

test("the round trip is stable when run twice", () => {
  const start = "a,b\n1,2";
  const once = csv(md(start));
  const twice = csv(md(once));
  assert.equal(once, twice);
});

test("a markdown table with a trailing newline round-trips", () => {
  assert.equal(csv("| a | b |\n| --- | --- |\n| 1 | 2 |\n"), "a,b\n1,2");
});

// --- format detection -----------------------------------------------------

test("detectFormat tells the two apart", () => {
  assert.equal(detectFormat("| a | b |\n| --- | --- |\n| 1 | 2 |"), "markdown");
  assert.equal(detectFormat("a,b\n1,2"), "csv");
  assert.equal(detectFormat(""), "empty");
  assert.equal(detectFormat("   "), "empty");
});

test("CSV containing pipes is not mistaken for Markdown", () => {
  assert.equal(detectFormat("a,b\nx|y,2"), "csv");
});

test("detectFormat never throws", () => {
  for (const junk of [null, undefined, 0, NaN, {}, [], () => {}]) {
    assert.doesNotThrow(() => detectFormat(junk));
  }
});
