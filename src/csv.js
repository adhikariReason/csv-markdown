// RFC 4180 CSV, parsed and serialised.
//
// A character state machine, not a split. `a,"b,c",d` has three fields, and
// splitting on commas gets that wrong; so does any regex once a quoted field
// contains a newline.

export const MAX_CELLS = 200000;   // refuse absurd input rather than hanging

export const CSV_ERRORS = {
  UNCLOSED_QUOTE: "A quoted field was never closed.",
  TOO_LARGE: "That table is too large to process.",
};

/**
 * Parse CSV text into an array of rows, each an array of string cells.
 * Returns { ok: true, rows } or { ok: false, reason }. Never throws.
 *
 * `delimiter` defaults to a comma; tabs and semicolons are common in exports.
 */
export function parseCsv(text, delimiter = ",") {
  if (text === null || text === undefined) return { ok: true, rows: [] };
  let input = String(text);

  // A UTF-8 BOM would otherwise become part of the first header cell, where it
  // is invisible and breaks every comparison against that header.
  if (input.charCodeAt(0) === 0xfeff) input = input.slice(1);

  if (typeof delimiter !== "string" || delimiter.length !== 1) delimiter = ",";

  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let fieldWasQuoted = false;
  let cells = 0;

  const endField = () => {
    // An unquoted empty field is empty; a quoted one is a deliberate "".
    row.push(field);
    field = "";
    fieldWasQuoted = false;
    cells += 1;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') { field += '"'; i += 1; }   // "" is a literal quote
        else inQuotes = false;
      } else {
        field += ch;                                          // commas and newlines included
      }
      continue;
    }

    if (ch === '"' && field === "") { inQuotes = true; fieldWasQuoted = true; continue; }
    if (ch === delimiter) { endField(); if (cells > MAX_CELLS) return { ok: false, reason: CSV_ERRORS.TOO_LARGE }; continue; }
    if (ch === "\r") { if (input[i + 1] === "\n") i += 1; endRow(); continue; }  // CRLF and bare CR
    if (ch === "\n") { endRow(); continue; }
    field += ch;
  }

  if (inQuotes) return { ok: false, reason: CSV_ERRORS.UNCLOSED_QUOTE };

  // A trailing newline ends the last row; it does not start an empty one.
  const trailingNewline = input.length > 0 && (input.endsWith("\n") || input.endsWith("\r"));
  if (!trailingNewline || field !== "" || row.length > 0) endRow();

  if (rows.length === 1 && rows[0].length === 1 && rows[0][0] === "" && input === "") return { ok: true, rows: [] };
  return { ok: true, rows };
}

/** Does this cell need quoting to survive a round trip? */
function needsQuoting(cell, delimiter) {
  return cell.includes(delimiter) || cell.includes('"') ||
         cell.includes("\n") || cell.includes("\r") ||
         cell !== cell.trim();          // leading/trailing spaces are significant
}

/** Serialise rows back to RFC 4180 CSV, quoting only where required. */
export function toCsv(rows, delimiter = ",", newline = "\n") {
  if (!Array.isArray(rows)) return "";
  if (typeof delimiter !== "string" || delimiter.length !== 1) delimiter = ",";

  return rows.map((row) => {
    const cells = Array.isArray(row) ? row : [row];
    return cells.map((raw) => {
      const cell = raw === null || raw === undefined ? "" : String(raw);
      return needsQuoting(cell, delimiter) ? `"${cell.replace(/"/g, '""')}"` : cell;
    }).join(delimiter);
  }).join(newline);
}

/** Guess the delimiter from the first line. Comma unless something beats it. */
export function sniffDelimiter(text) {
  const firstLine = String(text ?? "").split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", "\t", ";", "|"];
  let best = ",";
  let bestCount = 0;
  for (const d of candidates) {
    // Count only delimiters outside quotes, or a quoted comma wins wrongly.
    const parsed = parseCsv(firstLine, d);
    const count = parsed.ok && parsed.rows[0] ? parsed.rows[0].length - 1 : 0;
    if (count > bestCount) { best = d; bestCount = count; }
  }
  return best;
}
