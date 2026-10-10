# CSV ⇄ Markdown

Paste CSV, get a Markdown table. Paste a Markdown table, get CSV back. The
point is the round trip: the cases that break naive converters — quoted commas,
embedded newlines, pipes, significant whitespace — all survive intact.

No build step, no dependencies, no network calls. Everything happens in the page.

## Running it

ES modules need to be served over HTTP; opening `index.html` as a `file://` URL
will not work.

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Paste into either side, or drop a file on it.

## What it gets right

These are the cases that matter, and each has a test:

| Input | Handled how |
| --- | --- |
| `"Doe, Jane"` | Stays one cell; the comma does not become a column break |
| `"He said ""hi"""` | Doubled quotes read as one literal quote |
| A newline inside a quoted field | Becomes `<br>` in Markdown, restored on the way back |
| A pipe inside a cell | Escaped as `\|`, so it cannot split the column |
| `  padded  ` | Boundary spaces encoded as `&#32;` and restored — Markdown trims cell padding, which would otherwise eat them |
| A cell containing `---` | Kept as data; only the line after the header is the separator |
| CRLF, bare CR, UTF-8 BOM | Normalised; the BOM never ends up inside the first header |
| Ragged rows | Preserved in CSV, padded for Markdown, which cannot render uneven columns |
| Tabs and semicolons | Delimiter is sniffed from the header, so TSV just works |

## Known limits, stated rather than hidden

- **Round trips are lossless in content, not in formatting.** A newline inside a
  cell becomes `<br>`; if you then read that table with a different tool, it
  will see the literal text `<br>`.
- **Column alignment follows Unicode width, which fonts do not always honour.**
  A CJK character is two columns wide by the standard, and terminals, GitHub
  and most editors render it that way. Some browser fallback fonts do not — in
  testing, one rendered 日 at 1.66× the width of `a` — so the preview in this
  page can look very slightly off for CJK rows even though the output is
  correct where it is actually used.
- **Everything is held in memory.** Input above roughly 200,000 cells is
  refused rather than processed. There is no streaming mode.
- A `<br>` typed literally by a user is read back as a newline. This is
  ambiguous and documented rather than guessed at; there is a test asserting it.

## How it was tested

**Automated.** 71 tests with Node's built-in runner — no dependencies to install:

```bash
node --test
```

They cover the CSV state machine (26), the Markdown layer (20), the two
conversions and the round trip (14), and a hostile battery (11).

**Hostile input.** Every input is treated as hostile. Covered: injection
payloads (`<script>`, SQL, template, path traversal, CSV formula injection like
`=cmd|' /c calc'!A0`), null bytes, RTL overrides, lone surrogates, pathological
quoting (1,000 consecutive quote characters), a 2,000-column row, a 5,000-row
table, an over-size table that must be refused, and eight levels of nested
escaping. Every entry point is asserted to return a usable result rather than
throw, for every junk type including `Symbol`.

The round-trip test is the important one: eleven awkward cell types go
CSV → Markdown → CSV and are asserted equal to the originals, cell by cell.

## Layout

```
index.html         markup
styles.css         one type scale, one spacing scale, light + dark
src/csv.js         RFC 4180 parse and serialise — a character state machine
src/markdown.js    table render and parse, escaping, display width
src/convert.js     the two directions, composed
src/app.js         wiring only: panes, copy, drag and drop
tests/             node --test
```

`csv.js`, `markdown.js` and `convert.js` have no browser dependencies, which is
what lets the whole core be tested in Node without a headless browser.
