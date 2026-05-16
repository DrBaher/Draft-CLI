import { test } from "node:test";
import assert from "node:assert/strict";
import { docxXmlToText, extractDocxHighlights, detectDocxHighlight, decodeXml, extractDocxText } from "../draft-cli.mjs";
import { tmp, makeDocx } from "./_helpers.mjs";

test("docxXmlToText extracts paragraph text in order", () => {
  const xml = `<w:document xmlns:w="x"><w:body>
    <w:p><w:r><w:t>Hello</w:t></w:r><w:r><w:t> world</w:t></w:r></w:p>
    <w:p><w:r><w:t>Second line</w:t></w:r></w:p>
  </w:body></w:document>`;
  assert.equal(docxXmlToText(xml), "Hello world\nSecond line");
});

test("decodeXml handles entities", () => {
  assert.equal(decodeXml("A &amp; B &lt;c&gt; &quot;d&quot; &apos;e&apos;"), `A & B <c> "d" 'e'`);
});

test("extractDocxHighlights finds yellow runs", () => {
  const xml = `<w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>Acme</w:t></w:r>
               <w:r><w:t>plain</w:t></w:r>
               <w:r><w:rPr><w:highlight w:val="green"/></w:rPr><w:t>Date</w:t></w:r>`;
  const hits = extractDocxHighlights(xml);
  assert.equal(hits.length, 2);
  assert.equal(hits[0].text, "Acme");
  assert.equal(hits[0].color, "yellow");
  assert.equal(hits[1].text, "Date");
  assert.equal(hits[1].color, "green");
});

test("extractDocxHighlights ignores unrecognized colors", () => {
  const xml = `<w:r><w:rPr><w:highlight w:val="black"/></w:rPr><w:t>Skip</w:t></w:r>`;
  assert.equal(extractDocxHighlights(xml).length, 0);
});

test("detectDocxHighlight dedupes by text", () => {
  const xml = `<w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>Acme</w:t></w:r>
               <w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>Acme</w:t></w:r>`;
  const out = detectDocxHighlight(xml);
  assert.equal(out.length, 1);
  assert.equal(out[0].inner, "Acme");
});

test("extractDocxText round-trip on a synthesized .docx", async () => {
  const dir = tmp();
  const path = await makeDocx(dir, "sample.docx", [
    [{ text: "Between " }, { text: "Acme Corp", highlight: "yellow" }, { text: " and Vendor Inc." }],
    "Effective: 2026-06-01",
  ]);
  const { body, xml } = await extractDocxText(path);
  assert.match(body, /Between Acme Corp and Vendor Inc/);
  const hits = detectDocxHighlight(xml);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].inner, "Acme Corp");
});
