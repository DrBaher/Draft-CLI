import { test } from "node:test";
import assert from "node:assert/strict";
import { detectBracket, isBracketPlaceholder } from "../draft-cli.mjs";

test("isBracketPlaceholder accepts Title Case", () => {
  assert.equal(isBracketPlaceholder("Party A"), true);
  assert.equal(isBracketPlaceholder("Effective Date"), true);
  assert.equal(isBracketPlaceholder("State of California"), true);
});

test("isBracketPlaceholder rejects all-caps", () => {
  assert.equal(isBracketPlaceholder("CONFIDENTIALITY"), false);
  assert.equal(isBracketPlaceholder("ARTICLE I"), false);
});

test("isBracketPlaceholder rejects numeric-leading", () => {
  assert.equal(isBracketPlaceholder("3.1"), false);
});

test("isBracketPlaceholder rejects too-short", () => {
  assert.equal(isBracketPlaceholder("A"), false);
});

test("detectBracket finds multiple placeholders", () => {
  const body = "Between [Party A] and [Party B], effective [Effective Date].";
  const hits = detectBracket(body);
  assert.equal(hits.length, 3);
  assert.equal(hits[0].inner, "Party A");
  assert.equal(hits[1].inner, "Party B");
  assert.equal(hits[2].inner, "Effective Date");
});

test("detectBracket finds the same form repeatedly", () => {
  const body = "[Party A] does X. [Party A] also does Y. [Party B] watches.";
  const hits = detectBracket(body);
  assert.equal(hits.length, 3);
  assert.equal(hits.filter(h => h.inner === "Party A").length, 2);
});

test("detectBracket includes [See Section 4] (schema is the disambiguation tool)", () => {
  const body = "Confidentiality. See [See Section 4] for survival.";
  const hits = detectBracket(body);
  // Per Q1: the bracketed Title Case matches; the schema is what filters.
  assert.equal(hits.length, 1);
  assert.equal(hits[0].inner, "See Section 4");
});

test("detectBracket ignores headings and numeric refs", () => {
  const body = "[ARTICLE I]\n[3.1] Confidentiality. Party [A] obligation.";
  const hits = detectBracket(body);
  assert.equal(hits.length, 0);
});
