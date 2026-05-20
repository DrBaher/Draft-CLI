import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readDotenv, effectiveEnv, llmProviderFromEnv, llmProviderFromConfigFile, resolveLlmProvider, colorEnabled, paint } from "../draft-cli.mjs";
import { tmp, makeFile } from "./_helpers.mjs";

// Write a fake home with ~/.config/<dir>/llm.json and return the home path.
function fakeHomeWithLlm(subdir, cfg) {
  const home = tmp();
  const dir = join(home, ".config", subdir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "llm.json"), JSON.stringify(cfg), "utf8");
  return home;
}

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

test("llmProviderFromConfigFile reads the suite-shared contract-ops/llm.json", () => {
  const home = fakeHomeWithLlm("contract-ops", { provider: "openai", api_key: "fk", model: "gpt-foo" });
  const cfg = llmProviderFromConfigFile(home);
  assert.equal(cfg.provider, "openai");
  assert.equal(cfg.apiKey, "fk");
  assert.equal(cfg.model, "gpt-foo");
});

test("llmProviderFromConfigFile falls back to legacy ~/.config/draft-cli/llm.json", () => {
  const home = fakeHomeWithLlm("draft-cli", { provider: "anthropic", api_key: "lk" });
  const cfg = llmProviderFromConfigFile(home);
  assert.equal(cfg.provider, "anthropic");
  assert.equal(cfg.apiKey, "lk");
  assert.equal(cfg.model, "claude-sonnet-4-6"); // default
});

test("llmProviderFromConfigFile returns null without home or api_key", () => {
  assert.equal(llmProviderFromConfigFile(undefined), null);
  const home = fakeHomeWithLlm("contract-ops", { provider: "openai" }); // no api_key
  assert.equal(llmProviderFromConfigFile(home), null);
});

test("resolveLlmProvider: an env-configured provider wins over the config file", () => {
  const home = fakeHomeWithLlm("contract-ops", { provider: "openai", api_key: "filekey" });
  const cfg = resolveLlmProvider({ ANTHROPIC_API_KEY: "envkey", HOME: home });
  assert.equal(cfg.provider, "anthropic"); // env beats the file
  assert.equal(cfg.apiKey, "envkey");
});

test("resolveLlmProvider: falls back to the config file when env has no provider", () => {
  const home = fakeHomeWithLlm("contract-ops", { provider: "openai", api_key: "filekey" });
  const cfg = resolveLlmProvider({ HOME: home });
  assert.equal(cfg.provider, "openai");
  assert.equal(cfg.apiKey, "filekey");
});

test("resolveLlmProvider: null when neither env nor file configures a provider", () => {
  assert.equal(resolveLlmProvider({ HOME: tmp() }), null); // empty home, no file
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
