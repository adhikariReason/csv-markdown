// Wiring only. Every conversion decision lives in the pure modules, which is
// what lets the whole thing be tested without a browser.

import { csvToMarkdown, markdownToCsv } from "./convert.js";
import { parseCsv } from "./csv.js";

const left   = document.getElementById("left");
const right  = document.getElementById("right");
const align  = document.getElementById("align");
const status = document.getElementById("status");
const leftMeta  = document.getElementById("leftmeta");
const rightMeta = document.getElementById("rightmeta");

let updating = false;      // stops the two boxes echoing each other forever

const DELIMITER_NAMES = { ",": "comma", "\t": "tab", ";": "semicolon", "|": "pipe" };

function setStatus(message, kind = "") {
  status.textContent = message;
  status.className = "status" + (kind ? ` is-${kind}` : "");
}

function describe(rows) {
  if (!rows.length) return "";
  const columns = Math.max(...rows.map((r) => r.length));
  return `${rows.length} row${rows.length === 1 ? "" : "s"} × ${columns} column${columns === 1 ? "" : "s"}`;
}

function fromCsv() {
  if (updating) return;
  const result = csvToMarkdown(left.value, { align: align.checked });
  updating = true;
  if (result.ok) {
    right.value = result.output;
    const parsed = parseCsv(left.value, result.delimiter ?? ",");
    leftMeta.textContent = parsed.ok ? describe(parsed.rows) : "";
    rightMeta.textContent = "";
    const name = DELIMITER_NAMES[result.delimiter];
    setStatus(name && name !== "comma" ? `Read as ${name}-separated.` : "");
  } else {
    setStatus(result.reason, "error");
  }
  updating = false;
}

function fromMarkdown() {
  if (updating) return;
  const result = markdownToCsv(right.value);
  updating = true;
  if (result.ok) {
    left.value = result.output;
    const parsed = parseCsv(result.output);
    rightMeta.textContent = parsed.ok ? describe(parsed.rows) : "";
    leftMeta.textContent = "";
    setStatus("");
  } else if (right.value.trim() !== "") {
    setStatus(result.reason, "error");
  } else {
    left.value = "";
    setStatus("");
  }
  updating = false;
}

left.addEventListener("input", fromCsv);
right.addEventListener("input", fromMarkdown);
align.addEventListener("change", fromCsv);

async function copyFrom(box, label) {
  if (!box.value) return;
  try {
    await navigator.clipboard.writeText(box.value);
    setStatus(`${label} copied.`);
  } catch {
    box.select();                                  // clipboard blocked: select instead
    setStatus(`Press ${navigator.platform.includes("Mac") ? "⌘C" : "Ctrl+C"} to copy.`);
  }
}

document.getElementById("copyleft").addEventListener("click", () => copyFrom(left, "CSV"));
document.getElementById("copyright").addEventListener("click", () => copyFrom(right, "Markdown"));

document.getElementById("sample").addEventListener("click", () => {
  left.value = [
    "id,name,note",
    '1,"Doe, Jane",a comma inside quotes',
    '2,"He said ""hi""",doubled quotes',
    "3,a | b,a pipe",
    '4,"line one',
    'line two",an embedded newline',
    '5,"  padded  ",significant spaces',
    "6,日本語テキスト,wide characters",
    "7,emoji 🎉 here,astral plane",
    "8,C:\\path\\to,backslashes",
  ].join("\n");
  fromCsv();
});

// Dropping a file is the common case for a CSV that is already on disk.
for (const box of [left, right]) {
  box.addEventListener("dragover", (e) => { e.preventDefault(); box.classList.add("is-drop"); });
  box.addEventListener("dragleave", () => box.classList.remove("is-drop"));
  box.addEventListener("drop", async (e) => {
    e.preventDefault();
    box.classList.remove("is-drop");
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setStatus("That file is larger than 5 MB.", "error"); return; }
    try {
      box.value = await file.text();
      (box === left ? fromCsv : fromMarkdown)();
    } catch {
      setStatus("That file could not be read.", "error");
    }
  });
}
