// Markdown tables: rendered from rows, and parsed back.
//
// Two things break naive implementations. A pipe inside a cell silently splits
// it into two columns, and a newline inside a cell cannot be represented at
// all, because a Markdown table row is one line by definition.

export const MD_ERRORS = {
  NOT_A_TABLE: "That does not look like a Markdown table.",
};

/**
 * Display width of a string, for alignment.
 *
 * Not exact — a full implementation needs the Unicode east-asian width tables
 * — but it covers the ranges that actually appear in pasted data: CJK, kana,
 * fullwidth forms and emoji are two columns wide, combining marks are zero.
 */
export function displayWidth(text) {
  let width = 0;
  for (const ch of String(text)) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x0300 && cp <= 0x036f) continue;                 // combining marks
    if (cp === 0x200d || cp === 0xfe0f) continue;               // ZWJ, variation selector
    if (
      (cp >= 0x1100 && cp <= 0x115f) ||                         // hangul jamo
      (cp >= 0x2e80 && cp <= 0xa4cf) ||                         // CJK radicals .. yi
      (cp >= 0xac00 && cp <= 0xd7a3) ||                         // hangul syllables
      (cp >= 0xf900 && cp <= 0xfaff) ||                         // CJK compatibility
      (cp >= 0xfe30 && cp <= 0xfe6f) ||                         // CJK compatibility forms
      (cp >= 0xff00 && cp <= 0xff60) ||                         // fullwidth forms
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1f300 && cp <= 0x1faff)                          // emoji
    ) { width += 2; continue; }
    width += 1;
  }
  return width;
}

/** Make a cell safe to sit inside a Markdown table row. */
export function escapeCell(cell) {
  const escaped = String(cell ?? "")
    .replace(/\\/g, "\\\\")        // backslash first, or we escape our own escapes
    .replace(/\|/g, "\\|")         // a bare pipe would split the cell in two
    .replace(/\r\n|\r|\n/g, "<br>"); // a row is one line; this is the only way to keep it

  // Markdown pads cells with spaces for readability, so a reader has to trim
  // them — which would silently eat whitespace that was actually data. Encode
  // the boundary spaces so they survive; &#32; still renders as a space.
  return escaped
    .replace(/^[ \t]+/, (run) => run.replace(/ /g, "&#32;").replace(/\t/g, "&#9;"))
    .replace(/[ \t]+$/, (run) => run.replace(/ /g, "&#32;").replace(/\t/g, "&#9;"));
}

/** The inverse of escapeCell. */
export function unescapeCell(cell) {
  return String(cell ?? "")
    .replace(/&#32;/g, " ")
    .replace(/&#9;/g, "\t")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\\\|/g, "|")
    .replace(/\\\\/g, "\\");
}

/**
 * Render rows as an aligned Markdown table.
 *
 * Ragged rows are padded to the widest row: a Markdown table with uneven
 * columns renders as broken, so this is a real decision rather than a detail.
 */
export function toMarkdown(rows, { align = false } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return "";

  const escaped = rows.map((row) => (Array.isArray(row) ? row : [row]).map(escapeCell));
  const columns = Math.max(...escaped.map((r) => r.length));
  const padded = escaped.map((r) => [...r, ...Array(columns - r.length).fill("")]);

  const widths = Array.from({ length: columns }, (_, c) =>
    Math.max(3, ...padded.map((r) => displayWidth(r[c]))));   // 3 = minimum "---"

  const line = (cells) =>
    "| " + cells.map((cell, c) =>
      align ? cell + " ".repeat(Math.max(0, widths[c] - displayWidth(cell))) : cell
    ).join(" | ") + " |";

  const [header, ...body] = padded;
  const separator = "| " + widths.map((w) => "-".repeat(align ? w : 3)).join(" | ") + " |";

  return [line(header), separator, ...body.map(line)].join("\n");
}

/** Is this line a Markdown table separator like `| --- | :--: |`? */
function isSeparator(line) {
  return /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(line) && line.includes("-");
}

/** Split a table row on unescaped pipes only. */
function splitRow(line) {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|") && !trimmed.endsWith("\\|")) trimmed = trimmed.slice(0, -1);

  const cells = [];
  let cell = "";
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (ch === "\\" && (trimmed[i + 1] === "|" || trimmed[i + 1] === "\\")) {
      cell += ch + trimmed[i + 1];
      i += 1;
      continue;
    }
    if (ch === "|") { cells.push(cell); cell = ""; continue; }
    cell += ch;
  }
  cells.push(cell);
  return cells.map((c) => unescapeCell(c.trim()));
}

/**
 * Parse a Markdown table into rows.
 * Returns { ok: true, rows } or { ok: false, reason }. Never throws.
 */
export function parseMarkdown(text) {
  const lines = String(text ?? "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { ok: false, reason: MD_ERRORS.NOT_A_TABLE };

  const tableLines = lines.filter((l) => l.includes("|") || isSeparator(l));
  if (tableLines.length === 0) return { ok: false, reason: MD_ERRORS.NOT_A_TABLE };

  // Only ONE line is the separator: the one directly after the header. Dropping
  // every separator-looking line would silently delete a data row whose cell
  // happens to contain "---", which is real data loss rather than a cosmetic bug.
  const separatorIndex = tableLines.findIndex(isSeparator);
  const dataLines = tableLines.filter((_, i) => i !== separatorIndex);

  const rows = dataLines.map(splitRow);
  if (rows.length === 0) return { ok: false, reason: MD_ERRORS.NOT_A_TABLE };
  return { ok: true, rows };
}
