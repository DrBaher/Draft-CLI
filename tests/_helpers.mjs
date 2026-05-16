// Shared test utilities. Stdlib + jszip (only for synthesizing .docx fixtures).
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";

export function tmp() {
  return mkdtempSync(join(tmpdir(), "draft-cli-test-"));
}

export function makeFile(dir, name, content) {
  const path = join(dir, name);
  writeFileSync(path, content, "utf8");
  return path;
}

// Captures writes so a test can inspect stdout/stderr buffers.
export class CaptureStream extends Writable {
  constructor() { super(); this.chunks = []; }
  _write(c, _enc, cb) { this.chunks.push(c); cb(); }
  get text() { return Buffer.concat(this.chunks.map((c) => Buffer.isBuffer(c) ? c : Buffer.from(String(c)))).toString("utf8"); }
}

export function io() { return { out: new CaptureStream(), err: new CaptureStream() }; }

// Build a minimal .docx in-memory and write to disk. Returns the path.
// Honors a list of paragraphs; each paragraph is either a plain string or
// an array of run objects: { text, highlight?: "yellow"|"green"|... }.
export async function makeDocx(dir, name, paragraphs) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", RELS);
  zip.file("word/_rels/document.xml.rels", DOC_RELS);
  zip.file("word/document.xml", buildDocumentXml(paragraphs));
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  const path = join(dir, name);
  writeFileSync(path, buf);
  return path;
}

function buildDocumentXml(paragraphs) {
  const paras = paragraphs.map((p) => {
    const runs = Array.isArray(p) ? p : [{ text: p }];
    const runXml = runs.map((r) => {
      const rpr = r.highlight
        ? `<w:rPr><w:highlight w:val="${r.highlight}"/></w:rPr>`
        : "";
      const safe = String(r.text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return `<w:r>${rpr}<w:t xml:space="preserve">${safe}</w:t></w:r>`;
    }).join("");
    return `<w:p>${runXml}</w:p>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${paras}</w:body>
</w:document>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;

export function fakeSpawnSuccess(stdout = "") {
  return () => ({ status: 0, stdout, stderr: "", error: null });
}

export function fakeSpawnFail(stderr = "boom") {
  return () => ({ status: 1, stdout: "", stderr, error: null });
}

// Minimal fake fetch: returns the canned response based on URL.
export function fakeFetcher(handlers) {
  return async (url, init) => {
    for (const h of handlers) {
      if (url.includes(h.match)) {
        return {
          ok: h.status === undefined || (h.status >= 200 && h.status < 300),
          status: h.status || 200,
          async json() { return h.json; },
          async text() { return h.text || JSON.stringify(h.json); },
        };
      }
    }
    return { ok: false, status: 404, async json() { return {}; }, async text() { return "no handler"; } };
  };
}

// Helper to invoke main() with controlled IO and capture results.
export async function runMain(mainFn, argv, ioOverrides = {}) {
  const out = new CaptureStream();
  const err = new CaptureStream();
  const code = await mainFn(argv, { out, err, ...ioOverrides });
  return { code, out: out.text, err: err.text };
}
