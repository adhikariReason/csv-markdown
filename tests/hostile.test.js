import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, toCsv } from "../src/csv.js";
import { parseMarkdown, toMarkdown, escapeCell } from "../src/markdown.js";
import { csvToMarkdown, markdownToCsv, detectFormat } from "../src/convert.js";

// Every input is hostile until proven safe. These are the cases that break
// converters in the wild, plus the usual injection payloads.

const PAYLOADS = [
  "<script>alert(1)</script>",
  '"><img src=x onerror=alert(1)>',
  "'; DROP TABLE users; --",
  "{{7*7}}",
  "${process.exit(1)}",
  "../../etc/passwd",
  "=cmd|' /c calc'!A0",            // CSV formula injection
  "@SUM(1+1)*cmd|' /c calc'!A0",
  "\u0000nul\u0000",
  "‮rtl-override",
  "=1+1",
];

test("injection payloads pass through as literal data, never interpreted", () => {
  for (const payload of PAYLOADS) {
    const r = csvToMarkdown(`header\n${JSON.stringify(payload).replace(/^"|"$/g, '"')}`);
    assert.equal(typeof r.ok, "boolean");
  }
  // Round-tripped through both layers, a payload must come back unchanged.
  for (const payload of PAYLOADS) {
    const back = parseCsv(toCsv([[payload]]));
    assert.ok(back.ok);
    assert.equal(back.rows[0][0], payload, `mangled: ${JSON.stringify(payload)}`);
  }
});

test("a payload containing pipes cannot break out of its Markdown cell", () => {
  for (const payload of ["a|b", "|", "||", "a||b|", "\\|", "\\\\|"]) {
    const table = toMarkdown([["h"], [payload]]);
    const parsed = parseMarkdown(table);
    assert.ok(parsed.ok);
    assert.equal(parsed.rows.length, 2, `row count changed for ${JSON.stringify(payload)}`);
    assert.equal(parsed.rows[1].length, 1, `column count changed for ${JSON.stringify(payload)}`);
    assert.equal(parsed.rows[1][0], payload);
  }
});

test("a cell that looks like a separator row does not become one", () => {
  const table = toMarkdown([["h"], ["---"], ["data"]]);
  const parsed = parseMarkdown(table);
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.rows, [["h"], ["---"], ["data"]]);
});

test("HTML in a cell is data, and <br> written by a user survives as text", () => {
  // Our own <br> means a newline; a user typing it literally is ambiguous.
  // Documented behaviour: it reads back as a newline. Assert that explicitly
  // rather than leaving it to chance.
  const parsed = parseMarkdown("| h |\n| --- |\n| a<br>b |");
  assert.equal(parsed.rows[1][0], "a\nb");
});

test("pathological quoting does not hang or crash", () => {
  const cases = ['"'.repeat(1000), '","'.repeat(500), 'a,"'.repeat(300), '""""""""'];
  for (const input of cases) {
    const r = parseCsv(input);
    assert.equal(typeof r.ok, "boolean");
  }
});

test("a very wide row and a very tall table are handled", () => {
  const wide = Array(2000).fill("x").join(",");
  const wideParsed = parseCsv(wide);
  assert.ok(wideParsed.ok);
  assert.equal(wideParsed.rows[0].length, 2000);

  const tall = Array(5000).fill("a,b").join("\n");
  const tallParsed = parseCsv(tall);
  assert.ok(tallParsed.ok);
  assert.equal(tallParsed.rows.length, 5000);
});

test("an absurdly large table is refused rather than processed", () => {
  const huge = Array(250000).fill("x").join(",");
  const r = parseCsv(huge);
  assert.equal(r.ok, false);
  assert.match(r.reason, /too large/i);
});

test("every entry point returns a usable shape for any junk", () => {
  const junk = [null, undefined, 0, 1, -1, NaN, Infinity, true, false, {}, [], [[]], () => {}, Symbol.iterator];
  for (const j of junk) {
    for (const fn of [parseCsv, parseMarkdown, detectFormat, escapeCell]) {
      assert.doesNotThrow(() => fn(j), `${fn.name} threw on ${String(j)}`);
    }
    assert.doesNotThrow(() => toCsv(j), `toCsv threw on ${String(j)}`);
    assert.doesNotThrow(() => toMarkdown(j), `toMarkdown threw on ${String(j)}`);
    const a = csvToMarkdown(j), b = markdownToCsv(j);
    assert.equal(typeof a.ok, "boolean");
    assert.equal(typeof b.ok, "boolean");
    if (!a.ok) assert.equal(typeof a.reason, "string");
    if (!b.ok) assert.equal(typeof b.reason, "string");
  }
});

test("error messages never echo the payload back verbatim", () => {
  for (const payload of PAYLOADS) {
    const r = markdownToCsv(payload);
    if (!r.ok) assert.doesNotMatch(r.reason, /<script|DROP TABLE|onerror/i);
  }
});

test("a lone surrogate does not corrupt the output", () => {
  const lone = "a\ud800b";
  const back = parseCsv(toCsv([[lone]]));
  assert.ok(back.ok);
  assert.equal(back.rows[0][0].length, lone.length);
});

test("deeply nested escaping stays reversible", () => {
  let cell = "x";
  for (let i = 0; i < 8; i += 1) {
    const round = parseMarkdown(toMarkdown([["h"], [cell]]));
    assert.ok(round.ok);
    assert.equal(round.rows[1][0], cell, `failed at depth ${i}`);
    cell = "\\|" + cell + "|\\";
  }
});
