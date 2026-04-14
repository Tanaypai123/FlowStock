import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

const SRC = "/Users/tanaysharma/Desktop/FlowStock1/FlowStock/FlowStock_System_Documentation.md";
const OUT = "/Users/tanaysharma/Desktop/FlowStock1/FlowStock/FlowStock_System_Documentation.pdf";

const md = fs.readFileSync(SRC, "utf8");
const lines = md.split("\n");

// ── colours & sizes ──────────────────────────────────────────────────────────
const C = {
  bg:       "#0f172a",   // dark navy
  sidebar:  "#1e293b",
  accent:   "#6366f1",   // indigo
  accent2:  "#818cf8",
  h1:       "#f1f5f9",
  h2:       "#e2e8f0",
  h3:       "#cbd5e1",
  body:     "#cbd5e1",
  muted:    "#94a3b8",
  code:     "#f8fafc",
  codeBg:   "#1e293b",
  sep:      "#334155",
  tableHead:"#1e293b",
  tableRow: "#0f172a",
  tableAlt: "#162032",
  tableBdr: "#334155",
};

const PAGE = { size: "A4", margins: { top: 60, bottom: 60, left: 60, right: 55 } };
const W = 595 - PAGE.margins.left - PAGE.margins.right; // usable width

const doc = new PDFDocument({ ...PAGE, autoFirstPage: false, bufferPages: true });
const stream = fs.createWriteStream(OUT);
doc.pipe(stream);

// ── helpers ──────────────────────────────────────────────────────────────────
let pageNum = 0;

function newPage() {
  doc.addPage();
  pageNum++;
  // full-page dark background
  doc.rect(0, 0, 595, 842).fill(C.bg);
  // left accent stripe
  doc.rect(0, 0, 6, 842).fill(C.accent);
  // header bar
  doc.rect(0, 0, 595, 48).fill(C.sidebar);
  doc.rect(6, 0, 589, 48).fill(C.sidebar);
  // header text
  doc.fillColor(C.accent2).fontSize(8).font("Helvetica")
     .text("FlowStock — System Documentation", PAGE.margins.left, 18, { width: 300 });
  doc.fillColor(C.muted).fontSize(8)
     .text(`Page ${pageNum}`, 0, 18, { width: 595 - 30, align: "right" });
  doc.fillColor(C.sep).rect(PAGE.margins.left, 46, W, 0.5).fill();
  doc.y = PAGE.margins.top + 14;
}

function safeY(needed = 20) {
  if (doc.y + needed > 842 - PAGE.margins.bottom) newPage();
}

function hline(color = C.sep, thickness = 0.5) {
  doc.rect(PAGE.margins.left, doc.y, W, thickness).fill(color);
  doc.y += thickness + 6;
}

// ── inline markdown formatter ────────────────────────────────────────────────
// Strips *bold*, `code`, [link] from text for plain rendering.
function plainText(raw) {
  return raw
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/^\s*[-*]\s+/, "")
    .trim();
}

// ── table parser ─────────────────────────────────────────────────────────────
function isTableRow(l) { return l.trim().startsWith("|"); }
function isSepRow(l)   { return /^\|[\s\-:|]+\|/.test(l.trim()); }

function parseTable(rows) {
  return rows.map(r =>
    r.split("|")
      .slice(1, -1)
      .map(c => plainText(c))
  );
}

function renderTable(rows, startX = PAGE.margins.left) {
  const data = parseTable(rows.filter(r => !isSepRow(r)));
  if (data.length === 0) return;
  const cols = data[0].length;
  const colW = W / cols;
  const rowH = 22;
  const pad  = 5;
  const fontSize = 7.5;

  data.forEach((row, ri) => {
    safeY(rowH + 4);
    const y = doc.y;
    // row background
    const bg = ri === 0 ? C.tableHead : ri % 2 === 0 ? C.tableAlt : C.tableRow;
    doc.rect(startX, y, W, rowH).fill(bg);
    // border bottom
    doc.rect(startX, y + rowH - 0.5, W, 0.5).fill(C.tableBdr);

    row.forEach((cell, ci) => {
      const x = startX + ci * colW + pad;
      const fc = ri === 0 ? C.accent2 : C.body;
      const fw = ri === 0 ? "Helvetica-Bold" : "Helvetica";
      doc.font(fw).fontSize(fontSize).fillColor(fc)
         .text(cell, x, y + (rowH - fontSize) / 2 + 2, {
           width: colW - pad * 2,
           ellipsis: true,
           lineBreak: false,
         });
    });
    doc.y = y + rowH;
  });
  doc.y += 10;
}

// ── code block ───────────────────────────────────────────────────────────────
function renderCode(lines) {
  const text = lines.join("\n");
  const lineCount = lines.length;
  const lineH = 11;
  const pad   = 10;
  const blockH = lineCount * lineH + pad * 2;
  safeY(blockH + 8);

  doc.rect(PAGE.margins.left, doc.y, W, blockH).fill(C.codeBg);
  doc.rect(PAGE.margins.left, doc.y, 3, blockH).fill(C.accent);

  doc.font("Courier").fontSize(7).fillColor(C.code)
     .text(text, PAGE.margins.left + 12, doc.y + pad, {
       width: W - 16,
       lineGap: lineH - 7,
     });
  doc.y += blockH + 10;
}

// ── cover page ───────────────────────────────────────────────────────────────
function renderCover() {
  doc.addPage();
  pageNum++;
  // full dark bg
  doc.rect(0, 0, 595, 842).fill(C.bg);
  // top accent bar
  doc.rect(0, 0, 595, 8).fill(C.accent);
  // bottom accent bar
  doc.rect(0, 834, 595, 8).fill(C.accent);
  // center card
  const cx = 85, cy = 220, cw = 425, ch = 200;
  doc.rect(cx, cy, cw, ch).fill(C.sidebar);
  doc.rect(cx, cy, 4, ch).fill(C.accent);

  // Logo area
  doc.fillColor(C.accent).fontSize(36).font("Helvetica-Bold")
     .text("FlowStock", cx + 20, cy + 30, { width: cw - 40 });
  doc.fillColor(C.accent2).fontSize(13).font("Helvetica")
     .text("Complete System Documentation", cx + 20, cy + 82, { width: cw - 40 });

  doc.rect(cx + 20, cy + 108, cw - 40, 1).fill(C.sep);

  doc.fillColor(C.muted).fontSize(9).font("Helvetica")
     .text("Document Type: Technical Architecture & System Reference", cx + 20, cy + 122, { width: cw - 40 })
     .text("Audience:  Development Team", cx + 20, cy + 137, { width: cw - 40 })
     .text("Date:  April 2026", cx + 20, cy + 152, { width: cw - 40 })
     .text("Status:  Reflects production codebase — no assumed content", cx + 20, cy + 167, { width: cw - 40 });

  // bottom tag
  doc.fillColor(C.muted).fontSize(8).font("Helvetica")
     .text("Generated from source code analysis • Not for external distribution", 0, 800, {
       width: 595, align: "center"
     });
}

// ── MAIN RENDER LOOP ─────────────────────────────────────────────────────────
renderCover();
newPage();

let i = 0;
const tableBuffer = [];
const codeBuffer  = [];
let inCode  = false;
let inTable = false;

while (i < lines.length) {
  const raw = lines[i];
  const line = raw.trim();

  // ── code block toggle ──────────────────────────────────────────────────────
  if (line.startsWith("```")) {
    if (inCode) {
      renderCode(codeBuffer.splice(0));
      inCode = false;
    } else {
      // flush any pending table
      if (inTable && tableBuffer.length) {
        renderTable(tableBuffer.splice(0));
        inTable = false;
      }
      inCode = true;
    }
    i++; continue;
  }
  if (inCode) { codeBuffer.push(raw); i++; continue; }

  // ── table ─────────────────────────────────────────────────────────────────
  if (isTableRow(raw)) {
    inTable = true;
    tableBuffer.push(raw);
    i++; continue;
  } else if (inTable) {
    renderTable(tableBuffer.splice(0));
    inTable = false;
  }

  // ── blank line ────────────────────────────────────────────────────────────
  if (line === "") {
    if (doc.y < 842 - PAGE.margins.bottom - 20) doc.y += 6;
    i++; continue;
  }

  // ── horizontal rule ───────────────────────────────────────────────────────
  if (line === "---" || line === "---\r") {
    safeY(14);
    hline(C.accent, 1);
    i++; continue;
  }

  // ── headings ──────────────────────────────────────────────────────────────
  if (line.startsWith("# ")) {
    const text = plainText(line.slice(2));
    safeY(60);
    doc.y += 8;
    // heading background pill
    doc.rect(PAGE.margins.left, doc.y - 4, W, 36).fill(C.sidebar);
    doc.rect(PAGE.margins.left, doc.y - 4, 4, 36).fill(C.accent);
    doc.font("Helvetica-Bold").fontSize(18).fillColor(C.h1)
       .text(text, PAGE.margins.left + 14, doc.y + 4, { width: W - 18 });
    doc.y += 42;
    i++; continue;
  }
  if (line.startsWith("## ")) {
    const text = plainText(line.slice(3));
    safeY(48);
    doc.y += 10;
    doc.rect(PAGE.margins.left, doc.y, W, 28).fill(C.sidebar);
    doc.rect(PAGE.margins.left, doc.y, 3, 28).fill(C.accent2);
    doc.font("Helvetica-Bold").fontSize(13).fillColor(C.h2)
       .text(text, PAGE.margins.left + 12, doc.y + 7, { width: W - 16 });
    doc.y += 34;
    i++; continue;
  }
  if (line.startsWith("### ")) {
    const text = plainText(line.slice(4));
    safeY(30);
    doc.y += 6;
    doc.font("Helvetica-Bold").fontSize(10.5).fillColor(C.accent2)
       .text("▸  " + text, PAGE.margins.left + 2, doc.y, { width: W });
    doc.y += 16;
    i++; continue;
  }
  if (line.startsWith("#### ")) {
    const text = plainText(line.slice(5));
    safeY(20);
    doc.y += 4;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(C.h3)
       .text(text, PAGE.margins.left + 8, doc.y, { width: W });
    doc.y += 14;
    i++; continue;
  }

  // ── bullet list ───────────────────────────────────────────────────────────
  if (/^[-*]\s+/.test(line)) {
    const text = plainText(line);
    safeY(14);
    // bullet dot
    doc.circle(PAGE.margins.left + 6, doc.y + 5, 2).fill(C.accent);
    doc.font("Helvetica").fontSize(8.5).fillColor(C.body)
       .text(text, PAGE.margins.left + 16, doc.y, { width: W - 20, lineGap: 2 });
    doc.y += 14;
    i++; continue;
  }

  // ── numbered list ─────────────────────────────────────────────────────────
  if (/^\d+\.\s+/.test(line)) {
    const num  = line.match(/^(\d+)\./)[1];
    const text = plainText(line.replace(/^\d+\.\s+/, ""));
    safeY(14);
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(C.accent2)
       .text(num + ".", PAGE.margins.left + 2, doc.y, { width: 14, align: "right" });
    doc.font("Helvetica").fillColor(C.body)
       .text(text, PAGE.margins.left + 20, doc.y, { width: W - 22, lineGap: 2 });
    doc.y += 14;
    i++; continue;
  }

  // ── block quote ───────────────────────────────────────────────────────────
  if (line.startsWith(">")) {
    const text = plainText(line.slice(1).trim());
    safeY(22);
    doc.rect(PAGE.margins.left, doc.y, W, 20).fill(C.codeBg);
    doc.rect(PAGE.margins.left, doc.y, 3, 20).fill(C.accent);
    doc.font("Helvetica").fontSize(8).fillColor(C.muted)
       .text(text, PAGE.margins.left + 12, doc.y + 6, { width: W - 16 });
    doc.y += 24;
    i++; continue;
  }

  // ── normal paragraph ──────────────────────────────────────────────────────
  {
    const text = plainText(line);
    if (text) {
      safeY(14);
      doc.font("Helvetica").fontSize(9).fillColor(C.body)
         .text(text, PAGE.margins.left, doc.y, { width: W, lineGap: 3 });
      doc.y += 14;
    }
  }
  i++;
}

// flush any remaining table/code
if (inTable && tableBuffer.length) renderTable(tableBuffer);
if (inCode  && codeBuffer.length)  renderCode(codeBuffer);

doc.end();
stream.on("finish", () => { console.log("✅ PDF saved to:", OUT); });
stream.on("error",  (e) => { console.error("❌ Error:", e.message); });
