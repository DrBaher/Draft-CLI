import { test } from "node:test";
import assert from "node:assert/strict";
import { detectLlm } from "../draft-cli.mjs";
import { fakeFetcher } from "./_helpers.mjs";

const ANTHROPIC_OK = {
  match: "anthropic.com",
  json: {
    content: [{ text: `{"placeholders":[{"text":"Acme","suggested_key":"party_a"},{"text":"2026-01-01","suggested_key":"effective_date"}]}` }],
  },
};

const OPENAI_OK = {
  match: "openai.com",
  json: {
    choices: [{ message: { content: `{"placeholders":[{"text":"Acme","suggested_key":"party_a"}]}` } }],
  },
};

test("detectLlm parses Anthropic response and yields normalized hits", async () => {
  const hits = await detectLlm("body", { provider: "anthropic", apiKey: "k", model: "m" },
    { fetcher: fakeFetcher([ANTHROPIC_OK]) });
  assert.equal(hits.length, 2);
  assert.equal(hits[0].suggested_key, "party_a");
  assert.equal(hits[1].suggested_key, "effective_date");
});

test("detectLlm parses OpenAI response", async () => {
  const hits = await detectLlm("body", { provider: "openai", apiKey: "k" },
    { fetcher: fakeFetcher([OPENAI_OK]) });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].suggested_key, "party_a");
});

test("detectLlm drops entries with invalid keys", async () => {
  const handler = {
    match: "anthropic.com",
    json: { content: [{ text: `{"placeholders":[{"text":"x","suggested_key":"BadKey-1"}]}` }] },
  };
  const hits = await detectLlm("b", { provider: "anthropic", apiKey: "k" },
    { fetcher: fakeFetcher([handler]) });
  assert.equal(hits.length, 0);
});

test("detectLlm errors on non-JSON LLM output", async () => {
  const handler = { match: "anthropic.com", json: { content: [{ text: "not json at all" }] } };
  await assert.rejects(
    () => detectLlm("b", { provider: "anthropic", apiKey: "k" }, { fetcher: fakeFetcher([handler]) }),
    /non-JSON/
  );
});

test("detectLlm errors on HTTP failure", async () => {
  const handler = { match: "anthropic.com", status: 500, json: {}, text: "boom" };
  await assert.rejects(
    () => detectLlm("b", { provider: "anthropic", apiKey: "k" }, { fetcher: fakeFetcher([handler]) }),
    /LLM call failed/
  );
});

test("detectLlm errors on unsupported provider", async () => {
  await assert.rejects(
    () => detectLlm("b", { provider: "weird", apiKey: "k" }, { fetcher: fakeFetcher([]) }),
    /unsupported LLM provider/
  );
});
