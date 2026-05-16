# Security policy

## Posture

`draft-cli` is **local-first**. Every step of the substitution pipeline
runs on your machine. There is no telemetry, no usage reporting, no
crash reporter, and no auto-update.

## Network calls

There is exactly **one** outbound network surface in the entire CLI:
the optional T5 LLM tier. It runs only when **all** of these are true:

1. The deterministic tiers (bracket, mustache, `.docx` highlight,
   heuristic) all found zero placeholders.
2. A provider API key is configured — either in a `.env` file in the
   working directory or in the process environment.
3. `--no-llm` was not passed.

When T5 runs, it sends **template text only** to the configured
provider (Anthropic, OpenAI, or an explicit `DRAFT_LLM_*` override).
It does **not** send:

- The `--params` file contents
- The `<template>.params.json` schema contents
- The `.env` file contents (other than the API key it reads to make the call)
- CLI flag values
- Any other environment variables

Pass `--no-llm` to disable T5 even when env is configured.

## Dependencies

One runtime dependency: `jszip` (MIT, used for `.docx` unzip). Pinned
in `package.json`; verified at install time via `npm install --provenance`
when published. No transitive runtime deps beyond what jszip itself
needs.

All other parsing (`.env`, command-line args, XML, JSON) is hand-rolled
in `draft-cli.mjs` using the Node stdlib.

## Reporting a vulnerability

Email **Drbaher@gmail.com** with subject `draft-cli: security` and
include:

- Affected version (`draft --version`)
- A minimal reproduction (template snippet, command, observed behavior)
- The actual vs expected impact

Please give a reasonable disclosure window before publishing. I'll
acknowledge within 5 business days and aim to patch within 30 days for
anything that could leak template content, params, or `.env` contents.

## Threat model — what's in scope

- A malicious template that tries to exfiltrate data via the LLM tier.
  Mitigation: T5 sends template text only. No other context.
- A malicious schema file that triggers parser misbehavior.
  Mitigation: schema parsing is plain `JSON.parse` + structural validation;
  no `eval`, no `Function` constructor.
- A malicious `.docx` that triggers a zip bomb or path traversal.
  Mitigation: we only read `word/document.xml`; jszip is stream-bounded
  and `.docx` paths are hard-coded, not user-controlled.
- An untrusted `--dictionary` file. Mitigation: parsed as JSON array of
  strings; non-string entries rejected.

## Threat model — what's out of scope

- Running `draft-cli` on hostile shell input. `draft-cli` is a CLI; if
  your invocation context is hostile, that's your shell's problem.
- LLM provider compromise (Anthropic / OpenAI infrastructure). If you
  don't trust the provider, don't configure their key.
- A user who sets `--yes-heuristic` and then complains that the
  heuristic substituted over their real party name. That's the entire
  reason the default is "warn-only."
