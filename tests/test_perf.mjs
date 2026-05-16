// Performance smoke. These are bounds, not microbenchmarks: they catch
// catastrophic regressions (regex backtracking, O(n^2) substitution loops)
// without being so tight that they flake on slow CI hardware.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectBracket, detectMustache, detectHeuristic,
  substitute, canonicalKey, runCascade, parseArgs,
} from "../draft-cli.mjs";
import { makeDocx, tmp } from "./_helpers.mjs";

function repeat(s, n) { return new Array(n).fill(s).join(""); }

test("detectBracket on a 100k-char body with 1000 placeholders completes in < 500ms", () => {
  const body = repeat("Between [Party A] and [Party B], effective [Effective Date].\n", 1000);
  assert.ok(body.length > 50_000);
  const t0 = performance.now();
  const hits = detectBracket(body);
  const ms = performance.now() - t0;
  assert.equal(hits.length, 3000);
  assert.ok(ms < 500, `detection took ${ms.toFixed(1)}ms, expected < 500ms`);
});

test("detectBracket is not catastrophically slow on pathological near-misses", () => {
  // Many [...] runs that LOOK like placeholders but should be skipped
  // (markdown links, all-caps, sections, checkboxes). If the rule has
  // any backtracking failure mode, this is where it'd show.
  const lines = [];
  for (let i = 0; i < 500; i++) {
    lines.push(`[the link ${i}](http://example.com/${i})`);   // markdown link
    lines.push(`[ARTICLE ${i % 10}]`);                          // all-caps heading
    lines.push(`[${i}.${i % 10}]`);                             // section ref
    lines.push(`[x] checkbox option ${i}`);                     // checkbox
    lines.push(`[Real Placeholder ${i % 5}]`);                  // a real one
  }
  const body = lines.join("\n");
  const t0 = performance.now();
  const hits = detectBracket(body);
  const ms = performance.now() - t0;
  // Of 2500 bracketed runs, only the "Real Placeholder N" (5 distinct, 500 occurrences) should match.
  assert.equal(hits.length, 500);
  assert.ok(ms < 500, `pathological detection took ${ms.toFixed(1)}ms, expected < 500ms`);
});

test("detectMustache on a 50k-char body with 500 mustaches completes in < 300ms", () => {
  const body = repeat("Hello {{Party A}}, this is {{party_b}} on {{Effective Date}}.\n", 500);
  const t0 = performance.now();
  const hits = detectMustache(body);
  const ms = performance.now() - t0;
  assert.equal(hits.length, 1500);
  assert.ok(ms < 300, `mustache detection took ${ms.toFixed(1)}ms, expected < 300ms`);
});

test("detectHeuristic with the full bundled dictionary on a 100k-char body completes in < 1s", () => {
  // Every dictionary phrase appears once in the body. This is the realistic
  // worst case — every phrase forces a full body scan with one regex.
  const body = repeat("Lorem ipsum dolor sit amet. Acme Corporation and John Doe agreed.\n", 1500);
  const t0 = performance.now();
  const hits = detectHeuristic(body);
  const ms = performance.now() - t0;
  assert.ok(hits.length >= 2);
  assert.ok(ms < 1000, `heuristic detection took ${ms.toFixed(1)}ms, expected < 1000ms`);
});

test("substitute on a 100k-char body with 1000 hits completes in < 500ms", () => {
  const body = repeat("Between [Party A] and [Party B].\n", 1000);
  const placeholders = [
    { key: "party_a", hits: [{ match: "[Party A]", inner: "Party A" }] },
    { key: "party_b", hits: [{ match: "[Party B]", inner: "Party B" }] },
  ];
  const t0 = performance.now();
  const out = substitute(body, placeholders, { party_a: "Acme", party_b: "Vendor" }, "bracket");
  const ms = performance.now() - t0;
  assert.ok(!out.includes("[Party A]"));
  assert.ok(!out.includes("[Party B]"));
  assert.ok(ms < 500, `substitution took ${ms.toFixed(1)}ms, expected < 500ms`);
});

test("canonicalKey on long sentence-shaped inputs completes in < 10ms", () => {
  const text = "Evaluating whether to enter into a business relationship with the other party including potential acquisition opportunities and joint ventures";
  const t0 = performance.now();
  for (let i = 0; i < 10_000; i++) canonicalKey(text);
  const ms = performance.now() - t0;
  // 10k iterations as a stress; bound is generous.
  assert.ok(ms < 500, `10k canonicalKey calls took ${ms.toFixed(1)}ms, expected < 500ms`);
});

test("runCascade full pipeline on a 50k-char bracketed body completes in < 1s", async () => {
  const body = repeat("Between [Party A] and [Party B], effective [Effective Date].\n", 500);
  const input = { kind: "text", body, path: null };
  const opts = parseArgs(["x"]);
  const t0 = performance.now();
  const result = await runCascade(input, opts, null, {});
  const ms = performance.now() - t0;
  assert.equal(result.tier, "bracket");
  assert.equal(result.placeholders.length, 3);
  assert.ok(ms < 1000, `runCascade took ${ms.toFixed(1)}ms, expected < 1000ms`);
});

test(".docx with 200 highlighted runs extracts in < 2s", async () => {
  const dir = tmp();
  const paragraphs = [];
  for (let i = 0; i < 200; i++) {
    paragraphs.push([
      { text: "Section " + i + ": " },
      { text: "Party Name " + i, highlight: "yellow" },
      { text: " has the following obligations under this Agreement, including but not limited to: " },
      { text: "Effective Date", highlight: "green" },
      { text: " - the obligations begin on this date and continue until terminated." },
    ]);
  }
  const path = await makeDocx(dir, "stress.docx", paragraphs);
  const { extractDocxText, detectDocxHighlight } = await import("../draft-cli.mjs");
  const t0 = performance.now();
  const { body, xml } = await extractDocxText(path);
  const hits = detectDocxHighlight(xml);
  const ms = performance.now() - t0;
  assert.ok(body.length > 10_000);
  // 200 unique "Party Name N" texts + "Effective Date" (once after dedup)
  assert.equal(hits.length, 201);
  assert.ok(ms < 2000, `.docx extraction took ${ms.toFixed(1)}ms, expected < 2000ms`);
});
