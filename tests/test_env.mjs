import { test } from "node:test";
import assert from "node:assert/strict";
import { readDotenv, effectiveEnv, llmProviderFromEnv, colorEnabled, paint } from "../draft-cli.mjs";
import { tmp, makeFile } from "./_helpers.mjs";

test("readDotenv parses simple KEY=VALUE pairs", () => {
  const dir = tmp();
  const path = makeFile(dir, ".env", "FOO=bar\nBAZ=qux\n# comment\n\nEMPTY=\n");
  const env = readDotenv(path);
  assert.equal(env.FOO, "bar");
  assert.equal(env.BAZ, "qux");
  assert.equal(env.EMPTY, "");
});

test("readDotenv strips matching surrounding quotes", () => {
  const dir = tmp();
  const path = makeFile(dir, ".env", `Q1="quoted"\nQ2='also quoted'\n`);
  const env = readDotenv(path);
  assert.equal(env.Q1, "quoted");
  assert.equal(env.Q2, "also quoted");
});

test("readDotenv returns empty object when file absent", () => {
  assert.deepEqual(readDotenv("/nonexistent/.env"), {});
});

test("effectiveEnv: process env wins over file env", () => {
  const dir = tmp();
  makeFile(dir, ".env", "X=fromfile");
  const result = effectiveEnv(dir, { X: "fromprocess" });
  assert.equal(result.X, "fromprocess");
});

test("effectiveEnv: file env supplies values absent in process env", () => {
  const dir = tmp();
  makeFile(dir, ".env", "Y=fromfile");
  const result = effectiveEnv(dir, {});
  assert.equal(result.Y, "fromfile");
});

test("llmProviderFromEnv prefers DRAFT_LLM_* explicit override", () => {
  const cfg = llmProviderFromEnv({
    DRAFT_LLM_PROVIDER: "anthropic",
    DRAFT_LLM_API_KEY: "k",
    DRAFT_LLM_MODEL: "claude-foo",
    ANTHROPIC_API_KEY: "other",
  });
  assert.equal(cfg.provider, "anthropic");
  assert.equal(cfg.apiKey, "k");
  assert.equal(cfg.model, "claude-foo");
});

test("llmProviderFromEnv picks Anthropic when ANTHROPIC_API_KEY only", () => {
  const cfg = llmProviderFromEnv({ ANTHROPIC_API_KEY: "k" });
  assert.equal(cfg.provider, "anthropic");
});

test("llmProviderFromEnv picks OpenAI when OPENAI_API_KEY only", () => {
  const cfg = llmProviderFromEnv({ OPENAI_API_KEY: "k" });
  assert.equal(cfg.provider, "openai");
});

test("llmProviderFromEnv returns null when no provider configured", () => {
  assert.equal(llmProviderFromEnv({}), null);
});

test("colorEnabled respects NO_COLOR and FORCE_COLOR", () => {
  const saved = { NC: process.env.NO_COLOR, FC: process.env.FORCE_COLOR };
  try {
    process.env.NO_COLOR = "1"; delete process.env.FORCE_COLOR;
    assert.equal(colorEnabled({ isTTY: true }), false);
    delete process.env.NO_COLOR; process.env.FORCE_COLOR = "1";
    assert.equal(colorEnabled({ isTTY: false }), true);
    delete process.env.NO_COLOR; delete process.env.FORCE_COLOR;
    assert.equal(colorEnabled({ isTTY: true }), true);
    assert.equal(colorEnabled({ isTTY: false }), false);
  } finally {
    if (saved.NC !== undefined) process.env.NO_COLOR = saved.NC; else delete process.env.NO_COLOR;
    if (saved.FC !== undefined) process.env.FORCE_COLOR = saved.FC; else delete process.env.FORCE_COLOR;
  }
});

test("paint returns plain text when color disabled", () => {
  const saved = process.env.NO_COLOR;
  process.env.NO_COLOR = "1";
  try {
    assert.equal(paint("hi", "red", { isTTY: true }), "hi");
  } finally {
    if (saved !== undefined) process.env.NO_COLOR = saved; else delete process.env.NO_COLOR;
  }
});
