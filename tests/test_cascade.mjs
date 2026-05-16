import { test } from "node:test";
import assert from "node:assert/strict";
import { runCascade, parseArgs } from "../draft-cli.mjs";
import { fakeFetcher } from "./_helpers.mjs";

function input(body, kind = "text", docxXml) { return { body, kind, docxXml, path: null }; }

test("cascade stops at tier 1 when brackets are present", async () => {
  const o = parseArgs(["x"]);
  const r = await runCascade(input("[Party A]"), o, null, {});
  assert.equal(r.tier, "bracket");
  assert.equal(r.placeholders.length, 1);
});

test("cascade uses mustache when --syntax mustache and no bracket hits checked", async () => {
  const o = parseArgs(["x", "--syntax", "mustache"]);
  const r = await runCascade(input("{{Party A}}"), o, null, {});
  assert.equal(r.tier, "mustache");
  assert.equal(r.placeholders.length, 1);
});

test("cascade falls through to docx-highlight when no bracket/mustache present", async () => {
  const o = parseArgs(["x"]);
  const xml = `<w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>Acme</w:t></w:r>`;
  const r = await runCascade(input("Acme is a vendor.", "docx", xml), o, null, {});
  assert.equal(r.tier, "docx-highlight");
  assert.equal(r.placeholders.length, 1);
});

test("cascade falls through to heuristic when no markup present", async () => {
  const o = parseArgs(["x"]);
  const r = await runCascade(input("This is for Acme Corporation and John Doe."), o, null, {});
  assert.equal(r.tier, "heuristic");
  assert.ok(r.placeholders.length >= 2);
  assert.equal(r.heuristicGate, true);
});

test("cascade skips heuristic when --no-heuristic", async () => {
  const o = parseArgs(["x", "--no-heuristic"]);
  const r = await runCascade(input("Acme Corporation"), o, null, {});
  assert.equal(r.tier, "none");
});

test("cascade auto-falls to LLM when env configured and earlier tiers empty", async () => {
  const o = parseArgs(["x", "--no-heuristic"]);
  const env = { ANTHROPIC_API_KEY: "k" };
  const fetcher = fakeFetcher([{
    match: "anthropic.com",
    json: { content: [{ text: `{"placeholders":[{"text":"Acme","suggested_key":"party_a"}]}` }] },
  }]);
  const r = await runCascade(input("no markup at all"), o, null, env, { fetcher });
  assert.equal(r.tier, "llm");
  assert.equal(r.placeholders.length, 1);
});

test("cascade stops at heuristic boundary when no env LLM configured", async () => {
  const o = parseArgs(["x", "--no-heuristic"]);
  const r = await runCascade(input("nothing here"), o, null, {});
  assert.equal(r.tier, "none");
});

test("cascade --no-llm prevents LLM even when env is set", async () => {
  const o = parseArgs(["x", "--no-heuristic", "--no-llm"]);
  const env = { ANTHROPIC_API_KEY: "k" };
  const r = await runCascade(input("nothing here"), o, null, env);
  assert.equal(r.tier, "none");
});

test("cascade reports mixed-convention warning regardless of winner", async () => {
  const o = parseArgs(["x"]);
  const r = await runCascade(input("[Party A] and {{Party B}}"), o, null, {});
  assert.equal(r.tier, "bracket");
  assert.ok(r.warnings.some(w => w.includes("mixed placeholder conventions")));
});

test("--llm forces the LLM tier even with deterministic hits", async () => {
  const o = parseArgs(["x", "--llm"]);
  // No env -> the --llm forcing path errors out (per design).
  await assert.rejects(
    () => runCascade(input("[Party A]"), o, null, {}),
    /--llm requires an LLM provider/
  );
});
