import { test } from "node:test";
import assert from "node:assert/strict";
import { main, runCheckLlm, buildDiffBlock } from "../draft-cli.mjs";
import { runMain, fakeFetcher, makeFile, tmp, CaptureStream } from "./_helpers.mjs";

// ─── --check-llm ────────────────────────────────────────────────────────────

test("--check-llm with no provider env exits 1 with a clear hint", async () => {
  const { code, err } = await runMain(main, ["--check-llm"], { env: {} });
  assert.equal(code, 1);
  assert.match(err, /no LLM provider configured/);
  assert.match(err, /ANTHROPIC_API_KEY/);
});

test("--check-llm with a working provider exits 0 and reports the model", async () => {
  const fetcher = fakeFetcher([{
    match: "anthropic.com",
    json: { content: [{ text: `{"placeholders":[]}` }] },
  }]);
  const { code, out } = await runMain(main, ["--check-llm"], {
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetcher,
  });
  assert.equal(code, 0);
  assert.match(out, /ok: anthropic reachable/);
  assert.match(out, /claude-sonnet-4-6/);
});

test("--check-llm with auth failure exits 4", async () => {
  const fetcher = fakeFetcher([{
    match: "anthropic.com", status: 401, json: {}, text: "Unauthorized",
  }]);
  const { code, err } = await runMain(main, ["--check-llm"], {
    env: { ANTHROPIC_API_KEY: "bad-key" },
    fetcher,
  });
  assert.equal(code, 4);
  assert.match(err, /LLM call failed.*401/);
});

test("runCheckLlm() is exported and callable directly", async () => {
  const out = new CaptureStream(), err = new CaptureStream();
  const code = await runCheckLlm({}, out, err);
  assert.equal(code, 1);
  assert.match(err.text, /no LLM provider/);
});

// ─── --diff ─────────────────────────────────────────────────────────────────

test("--diff prints a substitution table and writes no output file", async () => {
  const dir = tmp();
  const outPath = `${dir}/should-not-exist.md`;
  const tpl = makeFile(dir, "x.md", "Between [Party A] and [Party B], effective [Effective Date]. [Party A] again.");
  const { code, out } = await runMain(main, [
    tpl, "--diff", "--output", outPath,
    "--party-a", "Acme", "--party-b", "Vendor", "--effective-date", "2026-06-01",
  ]);
  assert.equal(code, 0);
  assert.match(out, /changes that would be made/);
  assert.match(out, /\[Party A\].*→.*Acme.*×2/);
  assert.match(out, /\[Party B\].*→.*Vendor/);
  assert.match(out, /\[Effective Date\].*→.*2026-06-01/);
  assert.match(out, /3 placeholder\(s\), 4 substitution\(s\), 0 unresolved/);
  // Crucially: --output PATH is NOT written in diff mode.
  const { existsSync } = await import("node:fs");
  assert.equal(existsSync(outPath), false);
});

test("--diff --json emits a structured diff array", async () => {
  const dir = tmp();
  const tpl = makeFile(dir, "x.md", "[Party A] [Party B]");
  const { code, out } = await runMain(main, [
    tpl, "--diff", "--json",
    "--party-a", "Acme", "--party-b", "Vendor",
  ]);
  assert.equal(code, 0);
  const j = JSON.parse(out);
  assert.equal(j.ok, true);
  assert.equal(j.tier, "bracket");
  assert.equal(j.diff.length, 2);
  const byKey = Object.fromEntries(j.diff.map(d => [d.key, d]));
  assert.equal(byKey.party_a.from, "[Party A]");
  assert.equal(byKey.party_a.to, "Acme");
  assert.equal(byKey.party_b.to, "Vendor");
});

test("buildDiffBlock unresolved placeholder appears as (unresolved)", () => {
  const placeholders = [
    { first_seen_as: "Party A", key: "party_a", occurrences: 1 },
    { first_seen_as: "Party B", key: "party_b", occurrences: 1 },
  ];
  const block = buildDiffBlock(placeholders, { party_a: "Acme" }); // party_b missing
  assert.match(block, /\[Party A\].*→.*Acme/);
  assert.match(block, /\[Party B\].*→.*\(unresolved\)/);
  assert.match(block, /2 placeholder\(s\), 1 substitution\(s\), 1 unresolved/);
});

test("buildDiffBlock empty placeholders prints a friendly notice", () => {
  const block = buildDiffBlock([], {});
  assert.match(block, /no changes/);
});
