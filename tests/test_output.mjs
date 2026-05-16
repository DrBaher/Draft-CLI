import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { main, buildWhyBlock } from "../draft-cli.mjs";
import { tmp, runMain } from "./_helpers.mjs";

const FIXTURE = "tests/fixtures/bracket-template.md";

test("output to stdout vs --output PATH yields identical content", async () => {
  const dir = tmp();
  const outPath = join(dir, "draft.md");

  const args = [
    FIXTURE,
    "--party-a", "Acme",
    "--party-b", "Vendor",
    "--effective-date", "2026-06-01",
    "--state-of-california", "Delaware",
  ];

  const stdoutRun = await runMain(main, args);
  const fileRun = await runMain(main, [...args, "--output", outPath]);

  assert.equal(stdoutRun.code, 0);
  assert.equal(fileRun.code, 0);
  assert.equal(existsSync(outPath), true);
  const fileText = readFileSync(outPath, "utf8");
  assert.equal(stdoutRun.out, fileText);
});

test("--why prints a structured explanation block to stderr", async () => {
  const { code, err } = await runMain(main, [
    FIXTURE, "--why",
    "--party-a", "Acme",
    "--party-b", "Vendor",
    "--effective-date", "2026-06-01",
    "--state-of-california", "Delaware",
  ]);
  assert.equal(code, 0);
  assert.match(err, /why:/);
  assert.match(err, /tier {2,}= bracket/);
  assert.match(err, /placeholders {2,}= 4 distinct/);
  assert.match(err, /resolved {2,}= 4/);
});

test("--json emits a parseable result + placeholder report", async () => {
  const { code, out } = await runMain(main, [
    FIXTURE, "--json",
    "--party-a", "Acme",
    "--party-b", "Vendor",
    "--effective-date", "2026-06-01",
    "--state-of-california", "Delaware",
  ]);
  assert.equal(code, 0);
  const j = JSON.parse(out);
  assert.equal(j.ok, true);
  assert.equal(j.tier, "bracket");
  assert.match(j.output, /Acme/);
  assert.equal(j.placeholders.length, 4);
  assert.deepEqual(Object.keys(j.sources).sort(), ["effective_date", "party_a", "party_b", "state_of_california"]);
});

test("buildWhyBlock structures source counts correctly", () => {
  const block = buildWhyBlock({
    inputDescriptor: "x.md",
    schemaDescriptor: "(none, inferred)",
    tier: "bracket",
    placeholders: [
      { key: "a", occurrences: 2 },
      { key: "b", occurrences: 1 },
    ],
    sources: { a: "cli", b: "params" },
    missing: [],
    unmapped: [],
    warnings: [],
    outputPath: null,
  });
  assert.match(block, /tier {2,}= bracket/);
  assert.match(block, /placeholders {2,}= 2 distinct, 3 occurrences/);
  assert.match(block, /1 from CLI/);
  assert.match(block, /1 from --params/);
});

test("--version prints version, exits 0", async () => {
  const { code, out } = await runMain(main, ["--version"]);
  assert.equal(code, 0);
  assert.match(out, /draft-cli \d+\.\d+\.\d+/);
});

test("--help prints usage", async () => {
  const { code, out } = await runMain(main, ["--help"]);
  assert.equal(code, 0);
  assert.match(out, /USAGE/);
  assert.match(out, /DETECTION CASCADE/);
});

test("--demo writes a substituted draft to stdout (no file needed)", async () => {
  const { code, out, err } = await runMain(main, ["--demo"]);
  assert.equal(code, 0);
  assert.match(out, /Acme Corporation/);
  assert.match(out, /Vendor Inc\./);
  assert.match(out, /2026-06-01/);
  assert.match(err, /demo:/);
});

test("--silent suppresses stderr (--why block, warnings, notes)", async () => {
  const args = [
    "tests/fixtures/bracket-template.md", "--why",
    "--party-a", "Acme", "--party-b", "Vendor",
    "--effective-date", "2026-06-01", "--state-of-california", "Delaware",
  ];
  const normal = await runMain(main, args);
  const silent = await runMain(main, [...args, "--silent"]);
  assert.equal(silent.code, 0);
  // stdout (substituted draft) is unchanged.
  assert.equal(silent.out, normal.out);
  // stderr (why block) is empty.
  assert.equal(silent.err, "");
  // Without --silent, the why block is on stderr.
  assert.match(normal.err, /why:/);
});

test("--silent shorthand -q works", async () => {
  const args = [
    "tests/fixtures/bracket-template.md", "--why",
    "--party-a", "Acme", "--party-b", "Vendor",
    "--effective-date", "2026-06-01", "--state-of-california", "Delaware",
    "-q",
  ];
  const { code, err } = await runMain(main, args);
  assert.equal(code, 0);
  assert.equal(err, "");
});
