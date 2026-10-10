import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, toCsv, sniffDelimiter, CSV_ERRORS } from "../src/csv.js";

const rows = (text, d) => { const r = parseCsv(text, d); assert.ok(r.ok, r.reason); return r.rows; };

test("a plain table", () => {
  assert.deepEqual(rows("a,b\n1,2"), [["a", "b"], ["1", "2"]]);
});

test("quoted field containing the delimiter", () => {
  assert.deepEqual(rows('a,"b,c",d'), [["a", "b,c", "d"]]);
});

test("quoted field containing a newline", () => {
  assert.deepEqual(rows('a,"line one\nline two",c'), [["a", "line one\nline two", "c"]]);
});

test("doubled quotes are a literal quote", () => {
  assert.deepEqual(rows('a,"she said ""hi""",c'), [["a", 'she said "hi"', "c"]]);
});

test("a field that is only a quoted empty string", () => {
  assert.deepEqual(rows('a,"",c'), [["a", "", "c"]]);
});

test("CRLF line endings", () => {
  assert.deepEqual(rows("a,b\r\n1,2"), [["a", "b"], ["1", "2"]]);
});

test("bare CR line endings (old Mac exports)", () => {
  assert.deepEqual(rows("a,b\r1,2"), [["a", "b"], ["1", "2"]]);
});

test("a UTF-8 BOM is stripped, not left in the first header", () => {
  assert.deepEqual(rows("﻿name,age"), [["name", "age"]]);
  assert.equal(rows("﻿name,age")[0][0], "name");
});

test("a trailing newline does not create a phantom empty row", () => {
  assert.deepEqual(rows("a,b\n1,2\n"), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(rows("a,b\r\n1,2\r\n"), [["a", "b"], ["1", "2"]]);
});

test("a genuinely blank line is kept as an empty row", () => {
  assert.deepEqual(rows("a,b\n\n1,2"), [["a", "b"], [""], ["1", "2"]]);
});

test("ragged rows are preserved, not padded or truncated", () => {
  assert.deepEqual(rows("a,b,c\n1,2\n3,4,5,6"), [["a", "b", "c"], ["1", "2"], ["3", "4", "5", "6"]]);
});

test("whitespace inside fields is preserved exactly", () => {
  assert.deepEqual(rows('a, b ,"  c  "'), [["a", " b ", "  c  "]]);
});

test("empty input yields no rows", () => {
  assert.deepEqual(rows(""), []);
  assert.deepEqual(parseCsv(null).rows, []);
  assert.deepEqual(parseCsv(undefined).rows, []);
});

test("an unclosed quote is reported, not guessed at", () => {
  const r = parseCsv('a,"unterminated');
  assert.equal(r.ok, false);
  assert.equal(r.reason, CSV_ERRORS.UNCLOSED_QUOTE);
});

test("tab and semicolon delimiters", () => {
  assert.deepEqual(rows("a\tb\n1\t2", "\t"), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(rows("a;b\n1;2", ";"), [["a", "b"], ["1", "2"]]);
});

test("a quote appearing mid-field is literal, not a quoting start", () => {
  assert.deepEqual(rows('5" pipe,x'), [['5" pipe', "x"]]);
});

test("parseCsv never throws, whatever it is given", () => {
  for (const junk of [null, undefined, 0, 1, NaN, true, {}, [], () => {}, Symbol.iterator]) {
    assert.doesNotThrow(() => parseCsv(junk), String(junk));
  }
});

// --- serialising ---------------------------------------------------------

test("only cells that need quoting are quoted", () => {
  assert.equal(toCsv([["a", "b"], ["1", "2"]]), "a,b\n1,2");
  assert.equal(toCsv([["a,b", "c"]]), '"a,b",c');
  assert.equal(toCsv([['say "hi"']]), '"say ""hi"""');
  assert.equal(toCsv([["line\nbreak"]]), '"line\nbreak"');
});

test("significant leading and trailing spaces are quoted so they survive", () => {
  assert.equal(toCsv([[" padded "]]), '" padded "');
});

test("null and undefined cells become empty, not the word null", () => {
  assert.equal(toCsv([[null, undefined, "x"]]), ",,x");
});

test("toCsv is defensive about junk", () => {
  assert.equal(toCsv(null), "");
  assert.equal(toCsv("not rows"), "");
  assert.doesNotThrow(() => toCsv([[{}], [[]]]));
});

// --- round trip ----------------------------------------------------------

test("csv -> rows -> csv is stable for the awkward cases", () => {
  const nasty = [
    ["plain", "with,comma", 'with "quotes"'],
    ["with\nnewline", "  padded  ", ""],
    ["tab\there", "unicode ✓ 日本語", "emoji 🎉"],
  ];
  const once = toCsv(nasty);
  const back = parseCsv(once);
  assert.ok(back.ok);
  assert.deepEqual(back.rows, nasty);
  assert.equal(toCsv(back.rows), once);   // idempotent
});

test("round trip survives a quoted field holding every awkward character", () => {
  // Inside quotes, CR and LF are data rather than row breaks, so every one of
  // these must come back byte for byte.
  const cell = 'a,b"c\nd\re\tf|g\\h';
  const back = parseCsv(toCsv([[cell]]));
  assert.ok(back.ok);
  assert.equal(back.rows[0][0], cell);
});

// --- delimiter sniffing --------------------------------------------------

test("sniffDelimiter picks the delimiter that actually splits the header", () => {
  assert.equal(sniffDelimiter("a,b,c\n1,2,3"), ",");
  assert.equal(sniffDelimiter("a\tb\tc"), "\t");
  assert.equal(sniffDelimiter("a;b;c"), ";");
});

test("sniffDelimiter is not fooled by a comma inside a quoted field", () => {
  assert.equal(sniffDelimiter('"last, first"\tage\tcity'), "\t");
});

test("sniffDelimiter defaults to a comma when nothing splits", () => {
  assert.equal(sniffDelimiter("single"), ",");
  assert.equal(sniffDelimiter(""), ",");
});
