// The two conversions, composed from the CSV and Markdown layers.

import { parseCsv, toCsv, sniffDelimiter } from "./csv.js";
import { toMarkdown, parseMarkdown } from "./markdown.js";

/**
 * CSV text -> Markdown table.
 * Returns { ok: true, output } or { ok: false, reason }. Never throws.
 */
export function csvToMarkdown(text, { align = true, delimiter = null } = {}) {
  const d = delimiter ?? sniffDelimiter(text);
  const parsed = parseCsv(text, d);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  if (parsed.rows.length === 0) return { ok: true, output: "" };
  return { ok: true, output: toMarkdown(parsed.rows, { align }), delimiter: d };
}

/**
 * Markdown table -> CSV text.
 * Returns { ok: true, output } or { ok: false, reason }. Never throws.
 */
export function markdownToCsv(text, { delimiter = "," } = {}) {
  const parsed = parseMarkdown(text);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  return { ok: true, output: toCsv(parsed.rows, delimiter) };
}

/** Which direction does this input look like? Used to pick a default. */
export function detectFormat(text) {
  const input = String(text ?? "").trim();
  if (input === "") return "empty";
  const lines = input.split(/\r?\n/);
  const pipey = lines.filter((l) => l.includes("|")).length;
  const hasSeparator = lines.some((l) => /^\s*\|?\s*:?-{3,}:?\s*(\|.*)?$/.test(l));
  if (hasSeparator && pipey >= 1) return "markdown";
  return "csv";
}
