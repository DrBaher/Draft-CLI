# Contributing to draft-cli

Thanks for considering a contribution. A few constraints, then the workflow.

## Scope

`draft-cli` is **a single-file Node.js CLI for filling placeholders in
legal-document templates**. It deliberately is not:

- a template store (that's [`template-vault-cli`](https://github.com/DrBaher/template-vault-cli))
- a redline/negotiation tool (that's [`nda-review-cli`](https://github.com/DrBaher/nda-review-cli))
- a PDF converter (that's [`docx2pdf-cli`](https://github.com/DrBaher/docx2pdf-cli))
- a signing tool (that's [`sign-cli`](https://github.com/DrBaher/sign-cli))

If a proposed feature pushes draft-cli into one of those neighbors' lanes,
it probably belongs in the neighbor.

## Technical constraints

1. **Single file.** `draft-cli.mjs` stays one file. New helpers go inline.
2. **Stdlib + jszip.** No new runtime dependencies in v1. `jszip` is the
   one exception, justified by `.docx` unzip. New features should use
   Node's stdlib (`node:fs`, `node:path`, `node:test`, global `fetch`,
   etc.).
3. **Deterministic by default.** Any new detection or substitution must
   be deterministic. Non-deterministic behavior (LLM-backed) must be
   opt-in or env-gated, never default-on.
4. **Local-first.** No telemetry. The only outbound network call is the
   optional T5 LLM tier when a provider is configured.
5. **Composable.** Read from stdin, write to stdout, honor exit codes.
   Don't print decorative banners to stdout — banners go to stderr.

## Testing

- `make test` runs the full suite (`node --test tests/test_*.mjs`).
- One test file per concern, mirroring the file naming pattern.
- `tests/_helpers.mjs` is the shared utility module; new helpers go
  there if used by ≥ 2 tests.
- Mock network calls — never hit a real provider in tests. The LLM tier
  takes a `fetcher` injection point for exactly this reason.
- Coverage target: **≥ 80% line coverage** on `draft-cli.mjs`. The CI
  workflow enforces this.

## Commit style

Subject line + bullet body. Subjects in imperative mood, under 72 chars.
Body explains *why* the change is needed, not what each line does.

```
Add --yes-heuristic to bypass tier-4 confirmation

The non-interactive heuristic gate defaults to refusing substitution
because false positives are high-cost (substituting over a real
counterparty name). Scripts that have already vetted the template
need an explicit opt-out.
```

## Release process

1. Update `package.json` `"version"` and `CHANGELOG.md`.
2. Commit and push to `main`.
3. Tag the commit: `git tag v0.X.Y && git push --tags`.
4. The `publish.yml` workflow runs on the tag, verifies the version
   matches, runs the test suite, and publishes to npm with
   `--provenance` via Trusted Publishing.

No npm token is stored in repo secrets — publishing is OIDC-mediated.
